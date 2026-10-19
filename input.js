// Physical CSS pixels. Nearly diagonal or tiny gestures intentionally do nothing.
function swipeDirection(dx,dy){const x=Math.abs(dx),y=Math.abs(dy),major=Math.max(x,y),minor=Math.min(x,y);if(major<22||major-minor<8||major<minor*1.35)return null;return x>y?[Math.sign(dx),0]:[0,-Math.sign(dy)];}
if(typeof module!=='undefined')module.exports=swipeDirection;
