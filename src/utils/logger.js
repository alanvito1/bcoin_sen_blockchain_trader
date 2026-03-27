const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  gray: '\x1b[90m'
};

function getTimestamp() {
  return `${colors.gray}[${new Date().toLocaleTimeString()}]${colors.reset}`;
}

const logger = {
  colors,
  info: (msg) => console.log(`${getTimestamp()} ${msg}`),
  warn: (msg) => console.warn(`${getTimestamp()} ${colors.yellow}⚠️  ${msg}${colors.reset}`),
  error: (msg, err) => {
    console.error(`${getTimestamp()} ${colors.red}❌ ${msg}${colors.reset}`);
    if (err) console.error(err);
  },
  success: (msg) => console.log(`${getTimestamp()} ${colors.green}✅ ${msg}${colors.reset}`),
  step: (msg) => console.log(`${getTimestamp()} ${colors.cyan}➔ ${msg}${colors.reset}`),
  highlight: (msg) => `${colors.white}${msg}${colors.reset}`,
  dim: (msg) => `${colors.gray}${msg}${colors.reset}`,
  cyan: (msg) => `${colors.cyan}${msg}${colors.reset}`,
  magenta: (msg) => `${colors.magenta}${msg}${colors.reset}`,
  yellow: (msg) => `${colors.yellow}${msg}${colors.reset}`,
  red: (msg) => `${colors.red}${msg}${colors.reset}`,
  green: (msg) => `${colors.green}${msg}${colors.reset}`
};

module.exports = logger;
