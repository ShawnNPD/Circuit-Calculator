const nerdamer = require('nerdamer/all.min');
let sol = nerdamer('V=I*R').solveFor('V').toString();
console.log(nerdamer(sol, {I: 2, R: 3}).evaluate().text());
sol = nerdamer('V=I*R').solveFor('I').toString();
console.log(nerdamer(sol, {V: 6, R: 3}).evaluate().text());
