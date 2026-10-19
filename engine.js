/* Rules ported from ControlMovimiento.cs / ControlParcela.cs. */
class FarmGame {
  constructor(level){this.level=level;this.cells=new Set(level.cells.map(c=>c.join(',')));this.position=[...level.start];this.visited=new Set();this.path=[[...level.start]];this.score=0;this.combo=0;this.last='';this.state='ready';}
  canMove(dx,dy){const k=[this.position[0]+dx,this.position[1]+dy].join(',');return this.cells.has(k)&&!this.visited.has(k);}
  move(dx,dy){if(!Number.isInteger(dx)||!Number.isInteger(dy)||Math.abs(dx)+Math.abs(dy)!==1||!['ready','playing'].includes(this.state)||!this.canMove(dx,dy))return false;
    this.state='playing';this.position=[this.position[0]+dx,this.position[1]+dy];this.visited.add(this.position.join(','));this.path.push([...this.position]);const d=[dx,dy].join(',');this.combo=d===this.last?this.combo+10:10;this.last=d;this.score+=this.combo;
    if(this.visited.size===this.cells.size)this.state='won';else if(![[0,1],[0,-1],[1,0],[-1,0]].some(d=>this.canMove(...d)))this.state='lost';return true;}
}
if(typeof module!=='undefined')module.exports=FarmGame;
