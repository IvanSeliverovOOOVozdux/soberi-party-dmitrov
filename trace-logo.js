const potrace = require('potrace');
const fs = require('fs');

potrace.trace('brand/logo-wide.png', {
  threshold: 200,        // clean trace without anti-alias artifacts
  color:     '#f4a8c7',
  background: 'transparent',
  turdSize:  2,
  alphaMax:  1.3334,
  optTolerance: 0.2,
  optCurve:  true,
}, (err, svg) => {
  if (err) { console.error(err); process.exit(1); }
  fs.writeFileSync('brand/logo-traced.svg', svg);
  console.log('OK, bytes:', svg.length);
});
