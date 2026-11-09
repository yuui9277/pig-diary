/* 两台手机同步用的「云端小仓库」
 * 现在用 npoint.io（国内可直连、不用注册、CORS 可用、单仓 300KB 以上）。
 * 想换别家（比如以后自己开服务器），只改这两行即可。
 */
window.PIG_SYNC_CONFIG = window.PIG_SYNC_CONFIG || {
  base: 'https://api.npoint.io',
  bin: '715c51fa15079bdb663a'
};