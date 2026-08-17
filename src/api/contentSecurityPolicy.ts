export function buildContentSecurityPolicyDirectives() {
  const hcaptchaSources = ["https://hcaptcha.com", "https://*.hcaptcha.com"];

  return {
    defaultSrc: ["'self'"],
    scriptSrc: [
      "'self'",
      "https://www.youtube.com",
      "https://s.ytimg.com",
      "https://www.google.com/recaptcha/",
      "https://www.gstatic.com/recaptcha/",
      ...hcaptchaSources
    ],
    frameSrc: [
      "'self'",
      "https://www.youtube.com",
      "https://www.youtube-nocookie.com",
      "https://www.google.com/recaptcha/",
      "https://recaptcha.google.com/recaptcha/",
      ...hcaptchaSources
    ],
    imgSrc: ["'self'", "data:", "https://i.ytimg.com", "https://*.ytimg.com", "https://*.scdn.co", "https://cdn.discordapp.com"],
    mediaSrc: ["'self'", "blob:"],
    connectSrc: ["'self'", "ws:", "wss:", "https://www.google.com/recaptcha/", ...hcaptchaSources],
    styleSrc: ["'self'", "'unsafe-inline'", ...hcaptchaSources],
    formAction: ["'self'"],
    baseUri: ["'self'"],
    frameAncestors: ["https://discord.com", "https://*.discord.com"]
  };
}
