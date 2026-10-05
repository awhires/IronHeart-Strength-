const url=process.env.VITE_API_BASE_URL||process.env.VITE_API_URL;
if (process.env.VITE_STANDALONE_DEMO==='true' || !url || !URL.canParse(url) || new URL(url).protocol!=='https:' || ['localhost','127.0.0.1'].includes(new URL(url).hostname)) {
  console.error('Android release needs a hosted HTTPS backend. Set VITE_API_URL before building. See ANDROID-RELEASE.md.');
  process.exit(1);
}
console.log('Android backend URL configured.');
