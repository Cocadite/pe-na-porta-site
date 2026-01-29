import { sql } from "@vercel/postgres";

// Helpers
function json(res, status, body){
  res.statusCode = status;
  res.setHeader("Content-Type","application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}
function text(res, status, body){
  res.statusCode = status;
  res.setHeader("Content-Type","text/plain; charset=utf-8");
  res.end(String(body));
}
function isAuthed(req){
  const key = process.env.SITE_API_KEY;
  if (!key) return false;
  const h = req.headers["authorization"] || "";
  return h === `Bearer ${key}`;
}
function requireAuth(req, res){
  if (!isAuthed(req)){
    text(res, 401, "unauthorized");
    return false;
  }
  return true;
}

async function ensureSchema(){
  // config table
  await sql`CREATE TABLE IF NOT EXISTS config (
    id INT PRIMARY KEY,
    defaultLink TEXT NOT NULL
  );`;
  await sql`INSERT INTO config (id, defaultLink)
    VALUES (1, ${process.env.DEFAULT_BONDE_LINK || "https://www.roblox.com/share/g/1003923644"})
    ON CONFLICT (id) DO NOTHING;`;

  // tokens table
  await sql`CREATE TABLE IF NOT EXISTS form_tokens (
    token TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    discordTag TEXT NOT NULL,
    used BOOLEAN NOT NULL DEFAULT false,
    createdAt BIGINT NOT NULL
  );`;

  // submissions
  await sql`CREATE TABLE IF NOT EXISTS submissions (
    token TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    discordTag TEXT NOT NULL,
    nick TEXT NOT NULL,
    idade INT NOT NULL,
    motivo TEXT NOT NULL,
    linkBonde TEXT NOT NULL,
    status TEXT NOT NULL,
    staffId TEXT,
    createdAt BIGINT NOT NULL,
    decidedAt BIGINT
  );`;
}

function randomToken(){
  // 32 chars
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i=0;i<32;i++) out += chars[Math.floor(Math.random()*chars.length)];
  return out;
}

// Minimal body parser (Vercel already provides req.body for json in some runtimes, but be safe)
async function readBody(req){
  return await new Promise((resolve) => {
    let data = "";
    req.on("data", (c)=>{ data += c; });
    req.on("end", ()=> resolve(data));
  });
}
function parseForm(body){
  const params = new URLSearchParams(body);
  const o = {};
  for (const [k,v] of params.entries()) o[k]=v;
  return o;
}

export default async function handler(req, res){
  try{
    await ensureSchema();

    const op = (req.query?.op || "").toString();

    if (op === "health"){
      return json(res, 200, { ok: true });
    }

    // PUBLIC: createToken (called by bot)
    if (op === "createToken"){
      if (!requireAuth(req,res)) return;
      const raw = req.method === "POST" ? await readBody(req) : "";
      const body = raw ? JSON.parse(raw) : {};
      const userId = String(body.userId || "").trim();
      const discordTag = String(body.discordTag || "SeuDiscord#0000").trim();
      if (!userId) return text(res, 400, "userId missing");

      const token = randomToken();
      const createdAt = Date.now();

      await sql`INSERT INTO form_tokens (token, userId, discordTag, used, createdAt)
        VALUES (${token}, ${userId}, ${discordTag}, false, ${createdAt});`;

      const base = (process.env.SITE_BASE_URL || "").replace(/\/+$/,"");
      // if SITE_BASE_URL not set, infer from headers
      const inferred = `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;
      const site = base || inferred;

      const url = `${site}/form.html?token=${token}&tag=${encodeURIComponent(discordTag)}`;
      return json(res, 200, { token, url });
    }

    // PUBLIC: submit (form POST)
    if (op === "submit"){
      const raw = await readBody(req);
      const form = parseForm(raw);

      const token = String(form.token || "").trim();
      const nick = String(form.nick || "").trim().slice(0,64);
      const motivo = String(form.motivo || "").trim().slice(0,700);
      const idade = Number(form.idade || 0);
      const linkBonde = String(form.linkBonde || "").trim().slice(0,300);

      if (!token) return text(res, 400, "Token ausente.");
      if (!nick || !motivo || !Number.isFinite(idade) || idade < 5 || idade > 120) return text(res, 400, "Campos inválidos.");
      if (!/^https?:\/\//i.test(linkBonde)) return text(res, 400, "Link inválido.");

      const tok = await sql`SELECT token, userId, discordTag, used FROM form_tokens WHERE token=${token};`;
      if (!tok.rows.length) return text(res, 404, "Token inválido.");
      if (tok.rows[0].used) return text(res, 410, "Este link já foi usado. Peça /form de novo.");

      // mark used
      await sql`UPDATE form_tokens SET used=true WHERE token=${token};`;

      const userId = tok.rows[0].userid || tok.rows[0].userId;
      const discordTag = tok.rows[0].discordtag || tok.rows[0].discordTag;

      const createdAt = Date.now();
      await sql`INSERT INTO submissions (token, userId, discordTag, nick, idade, motivo, linkBonde, status, createdAt)
        VALUES (${token}, ${userId}, ${discordTag}, ${nick}, ${idade}, ${motivo}, ${linkBonde}, ${"PENDING"}, ${createdAt})
        ON CONFLICT (token) DO UPDATE SET nick=${nick}, idade=${idade}, motivo=${motivo}, linkBonde=${linkBonde};`;

      res.statusCode = 200;
      res.setHeader("Content-Type","text/html; charset=utf-8");
      res.end("<h2 style='font-family:Arial'>✅ Enviado! Aguarde aprovação no Discord.</h2>");
      return;
    }

    // AUTH: list pending
    if (op === "listPending"){
      if (!requireAuth(req,res)) return;
      const q = await sql`SELECT token, userId, discordTag, nick, idade, motivo, linkBonde, status, createdAt
        FROM submissions
        WHERE status IN (${ "PENDING" })
        ORDER BY createdAt DESC
        LIMIT 200;`;
      return json(res, 200, q.rows);
    }

    // AUTH: staffDecision
    if (op === "staffDecision"){
      if (!requireAuth(req,res)) return;
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const token = String(body.token || "").trim();
      const decision = String(body.decision || "").trim(); // APPROVED/REJECTED
      const staffId = String(body.staffId || "").trim().slice(0,64);
      if (!token) return text(res, 400, "token missing");
      if (!["APPROVED","REJECTED"].includes(decision)) return text(res, 400, "decision invalid");

      await sql`UPDATE submissions
        SET status=${decision}, staffId=${staffId || null}, decidedAt=${Date.now()}
        WHERE token=${token};`;

      return json(res, 200, { ok:true });
    }

    // AUTH: bot pulls approved
    if (op === "pullApproved"){
      if (!requireAuth(req,res)) return;
      const q = await sql`SELECT token, userId
        FROM submissions
        WHERE status=${"APPROVED"}
        ORDER BY decidedAt ASC
        LIMIT 50;`;
      return json(res, 200, q.rows);
    }

    // AUTH: mark done
    if (op === "markDone"){
      if (!requireAuth(req,res)) return;
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const token = String(body.token || "").trim();
      if (!token) return text(res, 400, "token missing");

      await sql`UPDATE submissions SET status=${"DONE"} WHERE token=${token} AND status=${"APPROVED"};`;
      return json(res, 200, { ok:true });
    }

    // AUTH: getConfig / setConfig
    if (op === "getConfig"){
      if (!requireAuth(req,res)) return;
      const q = await sql`SELECT defaultLink FROM config WHERE id=1;`;
      return json(res, 200, { defaultLink: q.rows?.[0]?.defaultlink || q.rows?.[0]?.defaultLink });
    }
    if (op === "setConfig"){
      if (!requireAuth(req,res)) return;
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const link = String(body.defaultLink || "").trim();
      if (!/^https?:\/\//i.test(link)) return text(res, 400, "invalid link");
      await sql`UPDATE config SET defaultLink=${link} WHERE id=1;`;
      return json(res, 200, { ok:true });
    }

    return text(res, 404, "not found");
  }catch(e){
    return text(res, 500, `error: ${e?.message || e}`);
  }
}
