// PreToolUse guard for run_command (Antigravity hooks contract: JSON stdin -> JSON stdout).
// Hook chỉ SIẾT thêm, không nới: lệnh không khớp rule trả DEFAULT_DECISION ("ask")
// để IDE áp policy hiện có. Mọi lỗi nội bộ cũng trả "ask".

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const DEFAULT_DECISION = 'ask';

// Thư mục được phép xoá đệ quy (build cache / test output).
const SAFE_DELETE = String.raw`(?:\.\\|\./)?(?:\.next[\w-]*|test-results|coverage)[\\/]?(?:\s|$|"|')`;

export const DENY_RULES = [
  { re: /\bprisma\s+(?:db\s+(?:push|seed|execute)|migrate\b)/i, reason: 'Prisma db push/migrate/seed/execute cần duyệt scope DB (AGENTS.md).' },
  { re: /\bnpm\s+run\s+(?:seed|db:\w+|migrate\w*)\b/i, reason: 'Script seed/migrate cần duyệt scope DB.' },
  { re: /\btsx\s+(?:prisma\/seed|scripts\/seed)/i, reason: 'Chạy seed trực tiếp cần duyệt scope DB.' },
  { re: /\bgit\s+push\b/i, reason: 'Git remote cần XAC_NHAN_GITHUB.' },
  { re: /\bgit\s+reset\s+--hard\b/i, reason: 'git reset --hard bị cấm (mất thay đổi).' },
  { re: /\bgit\s+clean\s+-\w*f/i, reason: 'git clean -f bị cấm (xoá file chưa track).' },
  { re: /\bdrop\s+(?:database|table|schema)\b/i, reason: 'DROP bị cấm.' },
  { re: /\b(?:cat|type|more|less|gc|Get-Content)\b[^|;&]*[\\/\s'"]\.env(?![\w.]*example)\b/i, reason: 'Không đọc file .env (secret).' },
];

const RECURSIVE_DELETE = [
  /\brm\s+-\w*r\w*\s+(.+)/i,
  /\b(?:Remove-Item|rmdir|rd|del|ri)\b(?=[^|;&]*-Recurse|[^|;&]*\s\/s\b)(.+)/i,
];

export const FORCE_ASK_RULES = [
  { re: /\bnpm\s+(?:install|i|add)\s+(?:-[-\w]+\s+)*[\w@]/i, reason: 'Thêm dependency mới — xác nhận trước.' },
  { re: /\bnpm\s+(?:uninstall|remove|rm)\b/i, reason: 'Gỡ dependency — xác nhận trước.' },
  { re: /\bgit\s+(?:checkout\s+--(?:\s|$)|(?:commit|restore|rebase|merge|stash\s+(?:drop|clear)|branch\s+-D)\b)/i, reason: 'Thay đổi lịch sử/working tree Git — xác nhận trước.' },
];

export function decide(payload) {
  const name = payload?.toolCall?.name ?? '';
  const cmd = String(payload?.toolCall?.args?.CommandLine ?? '');
  if (name !== 'run_command' || !cmd) return { decision: DEFAULT_DECISION };

  for (const r of DENY_RULES) if (r.re.test(cmd)) return { decision: 'deny', reason: `[sny-guard] ${r.reason}` };

  for (const re of RECURSIVE_DELETE) {
    const m = cmd.match(re);
    if (!m) continue;
    const targets = m[1].replace(/-(?:Recurse|Force)\b/gi, ' ').trim();
    const allSafe = targets.split(/\s*,\s*|\s+/).filter((t) => t && !t.startsWith('-')).every((t) => new RegExp(`^${SAFE_DELETE}`, 'i').test(`${t} `));
    if (!allSafe) return { decision: 'deny', reason: '[sny-guard] Xoá đệ quy chỉ cho phép .next*/test-results/coverage.' };
  }

  for (const r of FORCE_ASK_RULES) if (r.re.test(cmd)) return { decision: 'force_ask', reason: `[sny-guard] ${r.reason}` };

  return { decision: DEFAULT_DECISION };
}

async function main() {
  let out = { decision: DEFAULT_DECISION };
  try {
    let raw = '';
    for await (const chunk of process.stdin) raw += chunk;
    out = decide(JSON.parse(raw || '{}'));
  } catch {
    out = { decision: DEFAULT_DECISION, reason: '[sny-guard] lỗi đọc payload, chuyển sang hỏi user.' };
  }
  process.stdout.write(JSON.stringify(out));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
