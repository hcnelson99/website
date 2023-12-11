const width = 768;
const height = width;
const gridSize = 64;

const rows = height / gridSize;
const cols = width / gridSize;

let player_row = rows / 2;
let player_col = cols / 2;

function cg(x) {
  return x * gridSize + gridSize / 2;
}

let rope = [[cg(player_col), cg(player_row)] ];

let canvas;
let ctx;

function line(x0, y0, x1, y1, strokeStyle) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineWidth = 1;
  ctx.strokeStyle = strokeStyle;
  ctx.stroke();
}

function circle(x, y, r, fillStyle) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI)
  ctx.fillStyle = fillStyle;
  ctx.fill();
}


function draw_rope() {

  for (let i = 0; i < rope.length - 1; i++) {
    let r1 = rope[i];
    let r2 = rope[i + 1];
    line(r1[0], r1[1], r2[0], r2[1], 'brown');
  }


}

function rope_points() {
  for (let i = 0; i < rope.length; i++) {
    let r = rope[i];
    circle(r[0], r[1], 5, 'black');
  }
}

function render() {
  ctx.clearRect(0, 0, width, height);

  for (let row = 0; row < rows; row++) {
    line(0, row * gridSize, width, row * gridSize, 'black');
  }
  for (let col = 0; col < cols; col++) {
    line(col * gridSize, 0, col * gridSize, height, 'black');
  }

  draw_rope();

  circle(player_col * gridSize + gridSize / 2, player_row * gridSize + gridSize / 2, gridSize / 2 * 0.8, 'red');

  rope_points();

}

function pull() {
  if (rope.length > 2) {
    rope.splice(rope.length - 2, 1);

    for (let i = 0; i < 10; i++) {
      tension();
    }
  }
}

function tension() {
  for (let i = 1; i < rope.length - 1; i++) {
    let me = rope[i];
    let prev = rope[i - 1];
    let next = rope[i + 1];

    function pull(x0, y0, x1, y1) {
      let dx = x1 - x0;
      let dy = y1 - y0;
      let n = Math.sqrt(dx * dx + dy * dy);
      if (n <= gridSize) {
        return [0, 0];
      } else {
        return [dx - gridSize * dx / n, dy - gridSize * dy / n];
      }
    }

    let [px0, py0] = pull(...me, ...next);
    let [px1, py1] = pull(...me, ...prev);
    let px = px0 + px1;
    let py = py0 + py1;

    me[0] += px;
    me[1] += py;
  }
}

function move(dr, dc) {
  player_row += dr;
  player_col += dc;

  var l = rope[rope.length - 2];
  if (l && l[0] == player_row * gridSize && l[1] == player_col * gridSize) {
    rope.pop();
  } else {
    rope.push([cg(player_col), cg(player_row)]);
  }

}

function press(key) {
  const dispatch = {
    'w': [move, [-1, 0]],
    'a': [move, [0, -1]],
    's': [move, [1, 0]],
    'd': [move, [0, 1]],
    'q': [pull, []],
  };

  if (key in dispatch) {
    var d = dispatch[key];
    d[0](...d[1]);
  } else {
    console.log('unsupported key: ' + JSON.stringify(key));
  }


  render();
}

window.onload = function() {
  canvas = document.getElementById('canvas');
  ctx = canvas.getContext('2d');


  window.addEventListener('keypress',  function(e) {
    press(e.key);
  });

  render();

}
