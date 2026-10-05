export function validateApiBase(value,{preview=false}={}){
 if(!value?.trim())return '';
 let u;try{u=new URL(value.trim());}catch{throw Error('Enter an API address such as http://192.168.1.10:4173.');}
 const privateHost=/^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(u.hostname);
 if(u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname)||!(u.protocol==='https:'||(preview&&u.protocol==='http:'&&privateHost)))throw Error('Use HTTPS, or a private LAN HTTP address in the phone preview. Do not include credentials or paths.');
 return u.origin;
}
export const NETWORK_MESSAGE='AI server unavailable. Make sure the computer running Iron Heart and this phone are on the same network and the Iron Heart API server is running.';
