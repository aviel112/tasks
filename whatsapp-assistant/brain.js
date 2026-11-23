// המוח: מריץ את Claude Code במצב headless על המנוי הקיים (בלי מפתח API)
const { execFile } = require('child_process')
const fs = require('fs')
const api = require('./api')
const path = require('path')

const BRAIN_DIR = path.join(__dirname, 'brain')
const SESSION_FILE = path.join(BRAIN_DIR, '.session-id')
const CLAUDE_BIN = process.env.CLAUDE_BIN || '/usr/local/bin/claude'
// שיחה מתאפסת אחרי 12 שעות שקט — שיחות ארוכות שורפות טוקנים על היסטוריה
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000

function brainModel() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')).model || 'haiku'
  } catch {
    return 'haiku'
  }
}

function runClaude(prompt, resumeId, model, keepSession = true, timeoutMs = 300000) {
  return new Promise((resolve, reject) => {
    const args = ['-p', prompt, '--output-format', 'json', '--model', model || brainModel()]
    if (resumeId) args.push('--resume', resumeId)
    const env = { ...process.env }
    // ניקוי משתני סביבה של סשן Claude חיצוני, כדי שההרצה תהיה עצמאית ועל המנוי
    delete env.CLAUDECODE
    delete env.CLAUDE_CODE_ENTRYPOINT
    delete env.ANTHROPIC_API_KEY
    // בלי זה ה-CLI לא טוען את המחברים של claude.ai (Gmail, Drive, Notion)
    env.ENABLE_CLAUDEAI_MCP_SERVERS = 'true'
    const child = execFile(
      CLAUDE_BIN,
      args,
      { cwd: BRAIN_DIR, env, timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err && !stdout) return reject(new Error((stderr || err.message || '').slice(0, 500)))
        let out
        try {
          out = JSON.parse(stdout)
        } catch {
          return reject(new Error('brain: bad output — ' + String(stdout).slice(0, 300)))
        }
        if (out.session_id && keepSession) fs.writeFileSync(SESSION_FILE, out.session_id)
        if (out.is_error) return reject(new Error(String(out.result || 'brain error').slice(0, 500)))
        resolve(out.result || '')
      }
    )
    child.stdin?.end()
  })
}

function currentSession() {
  try {
    const st = fs.statSync(SESSION_FILE)
    if (Date.now() - st.mtimeMs > SESSION_MAX_AGE_MS) {
      resetSession()
      return null
    }
    return fs.readFileSync(SESSION_FILE, 'utf8').trim() || null
  } catch {
    return null
  }
}

function resetSession() {
  try { fs.unlinkSync(SESSION_FILE) } catch {}
}

const isLimitError = (e) => /hit your limit|usage limit|rate limit|out of extra usage|extra usage/i.test(e?.message || '')

// sonnet כותב עברית ברורה הרבה יותר מ-haiku; אם המכסה נגמרת — נופלים ל-haiku כדי שהעוזרת לא תשתתק
const FALLBACK_MODEL = 'haiku'
async function withFallback(run, model) {
  const m = model || brainModel()
  try {
    return await run(m)
  } catch (e) {
    if (!isLimitError(e) || m === FALLBACK_MODEL) throw e
    return run(FALLBACK_MODEL)
  }
}

async function askBrain(prompt, model) {
  const sid = currentSession()
  try {
    return await withFallback((m) => runClaude(prompt, sid, m), model)
  } catch (e) {
    if (isLimitError(e) || !sid) throw e
    // סשן ישן/פג — מנסים פעם אחת עם שיחה נקייה
    resetSession()
    return withFallback((m) => runClaude(prompt, null, m), model)
  }
}

// משימה חד-פעמית (התראת ליד, תזכורת) — לא נוגעת בשיחה הפתוחה של אביאל עם העוזרת
// בלי כלים → API (קרדיט עד 20.11, מטמון על system); עם כלים או כשה-API לא זמין → המנוי
async function askBrainOnce(prompt, model, { timeoutMs, tools = false, system = '', label = 'once', effort, maxTokens } = {}) {
  if (!tools) {
    const out = await api.complete({ system, user: prompt, label, maxTokens, effort: effort || (model === 'haiku' ? 'low' : 'medium') }).catch(() => null)
    if (out) return out
  }
  const full = system ? system + '\n\n' + prompt : prompt
  return withFallback((m) => runClaude(full, null, m, false, timeoutMs), model)
}

// ── 23.11.26 (אביאל: "שהצ'אט עם העוזרת יהיה כמו הצ'אט עם קלוד"): מצב מלא לצ'אט הפרטי —
// Claude Code המעודכן, המודל החזק, תיקיית הפרויקט (אותו זיכרון), הרשאות auto, שיחה שנשמרת 3 ימים ──
const FULL_BIN = process.env.CLAUDE_FULL_BIN || path.join(process.env.HOME || '/Users/user', '.local/bin/claude')
const FULL_CWD = path.join(__dirname, '..')
const FULL_SESSION = path.join(BRAIN_DIR, '.session-full')
const FULL_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000
function fullCfg() { try { const c = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')); return { model: c.fullModel || 'claude-opus-5-5', fallback: c.fullFallback || 'sonnet' } } catch { return { model: 'claude-opus-5-5', fallback: 'sonnet' } } }
function fullSession() { try { const st = fs.statSync(FULL_SESSION); if (Date.now() - st.mtimeMs > FULL_MAX_AGE_MS) { fs.unlinkSync(FULL_SESSION); return null } return fs.readFileSync(FULL_SESSION, 'utf8').trim() || null } catch { return null } }
function runFull(prompt, sid, model) {
  return new Promise((resolve, reject) => {
    let sys = ''; try { sys = fs.readFileSync(path.join(BRAIN_DIR, 'FULL.md'), 'utf8') } catch {}
    const args = ['-p', prompt, '--output-format', 'json', '--model', model, '--permission-mode', 'auto']
    if (sys) args.push('--append-system-prompt', sys)
    if (sid) args.push('--resume', sid)
    const env = { ...process.env }; delete env.CLAUDECODE; delete env.CLAUDE_CODE_ENTRYPOINT; delete env.ANTHROPIC_API_KEY; env.ENABLE_CLAUDEAI_MCP_SERVERS = 'true'
    const child = execFile(FULL_BIN, args, { cwd: FULL_CWD, env, timeout: 45 * 60 * 1000, maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && !stdout) return reject(new Error((stderr || err.message || '').slice(0, 500)))
      let out; try { out = JSON.parse(stdout) } catch { return reject(new Error('full brain: bad output — ' + String(stdout).slice(0, 300))) }
      if (out.session_id) fs.writeFileSync(FULL_SESSION, out.session_id)
      if (out.is_error) return reject(new Error(String(out.result || 'brain error').slice(0, 500)))
      resolve(out.result || '')
    })
    child.stdin?.end()
  })
}
let fullLock = Promise.resolve()
function askBrainFull(prompt) {
  const job = fullLock.then(async () => {
    const { model, fallback } = fullCfg(), sid = fullSession()
    const go = async (m) => { try { return await runFull(prompt, sid, m) } catch (e) { if (isLimitError(e) || !sid) throw e; try { fs.unlinkSync(FULL_SESSION) } catch {} return runFull(prompt, null, m) } }
    try { return await go(model) } catch (e) { if (!isLimitError(e) || model === fallback) throw e; return go(fallback) }
  })
  fullLock = job.catch(() => {})
  return job
}
function resetFullSession() { try { fs.unlinkSync(FULL_SESSION) } catch {} }

module.exports = { askBrain, askBrainOnce, askBrainFull, resetSession, resetFullSession, isLimitError }
