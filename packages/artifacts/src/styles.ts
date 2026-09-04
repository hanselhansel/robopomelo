export const printStyles=`
:root{color-scheme:light;font-family:system-ui,sans-serif;color:#242923;background:#f7f5f0;font-size:16px;line-height:1.55}
*{box-sizing:border-box}body{margin:0;padding:48px 24px}main{max-width:900px;margin:auto;background:white;padding:48px}
h1,h2{font-family:Georgia,serif;font-weight:600}h1{font-size:36px;line-height:1.15}h2{font-size:26px;margin-top:40px;border-top:1px solid #d8ddd1;padding-top:24px}h3{font-size:19px;margin-top:28px}
p,dd,pre{overflow-wrap:anywhere;white-space:pre-wrap}.brand{color:#315345;font-weight:650}.status{border-left:4px solid #76501a;padding:12px 16px;background:#fff5d9}.metadata{font-size:12px;color:#596256;line-height:1.7}
dl{margin:0}dt{font-weight:600;margin-top:14px}dd{margin:4px 0 0}.record{margin-bottom:24px}.record-id{font-size:12px;color:#596256}a{color:#315345}
@media(max-width:600px){body{padding:0}main{padding:24px 16px}h1{font-size:28px}}
@page{margin:17mm}@media print{:root{background:white}body,main{margin:0;padding:0;max-width:none}h1,h2,h3,dt{break-after:avoid}h2{margin-top:24px}.metadata{font-size:9pt}body{font-size:10.5pt}.status{background:none}p,dd{orphans:3;widows:3}}
`;
