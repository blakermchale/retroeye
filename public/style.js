function get(id) {
    return document.getElementById(id);
}

function hide(id) {
    get(id).style.visibility = 'hidden';
}

function show(id) {
    get(id).style.visibility = null;
}

function html(id, html) {
    get(id).innerHTML = html;
}

function timestamp() {
    return new Date().getTime();
}

function random(min, max) {
    return (min + (Math.random() * (max - min)));
}

function randomChoice(choices) {
    return choices[Math.round(random(0, choices.length - 1))];
}

function getEyeData() {
    let xmlHttp = new XMLHttpRequest();
    xmlHttp.open("GET", "http://127.0.0.1:5000/direction", false);
    xmlHttp.send(null);
    return xmlHttp.responseText;
}

if (!window.requestAnimationFrame) {
    window.requestAnimationFrame = window.webkitRequestAnimationFrame ||
        window.mozRequestAnimationFrame ||
        window.oRequestAnimationFrame ||
        window.msRequestAnimationFrame ||
        function (callback, element) {
            window.setTimeout(callback, 1000 / 60);
        }
}
//-------------------------------------------------------------------------
// game constants
//-------------------------------------------------------------------------
let KEY = {ESC: 27, SPACE: 32, LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, SHIFT: 16},
    DIR = {UP: 0, RIGHT: 1, DOWN: 2, LEFT: 3, MIN: 0, MAX: 3, SWAP: -1},
    stats = new Stats(),
    canvas = get('canvas'),
    ctx = canvas.getContext('2d'),
    ucanvas = get('upcoming'),
    holdCanvas = get('held'),
    uctx = ucanvas.getContext('2d'),
    holdctx = holdCanvas.getContext('2d'),
    speed = {start: 100, decrement: 0.005, min: 100}, // how long before piece drops by 1 row (seconds)
    nx = 10, // width of tetris court (in blocks)
    ny = 20, // height of tetris court (in blocks)
    nu = 5;  // width/height of upcoming preview (in blocks)
//-------------------------------------------------------------------------
// game variables (initialized during reset)
//-------------------------------------------------------------------------
let dx, dy,        // pixel size of a single tetris block
    blocks,        // 2 dimensional array (nx*ny) representing tetris court - either empty block or occupied by a 'piece'
    actions,       // queue of user actions (inputs)
    playing,       // true|false - game is in progress
    dt,            // time since starting this game
    current,       // the current piece
    next,          // the next piece
    hold,          // the held piece
    score,         // the current score
    vscore,        // the currently displayed score (it catches up to score in small chunks - like a spinning slot machine)
    rows,          // number of completed rows in the current game
    step;          // how long before current piece drops by 1 row
let canSwap = true;
//-------------------------------------------------------------------------
// tetris pieces
//
// blocks: each element represents a rotation of the piece (0, 90, 180, 270)
//         each element is a 16 bit integer where the 16 bits represent
//         a 4x4 set of blocks, e.g. j.blocks[0] = 0x44C0
//
//             0100 = 0x4 << 3 = 0x4000
//             0100 = 0x4 << 2 = 0x0400
//             1100 = 0xC << 1 = 0x00C0
//             0000 = 0x0 << 0 = 0x0000
//                               ------
//                               0x44C0
//
//-------------------------------------------------------------------------
let i = {size: 4, blocks: [0x0F00, 0x2222, 0x00F0, 0x4444], color: 'cyan'};
let j = {size: 3, blocks: [0x44C0, 0x8E00, 0x6440, 0x0E20], color: 'blue'};
let l = {size: 3, blocks: [0x4460, 0x0E80, 0xC440, 0x2E00], color: 'orange'};
let o = {size: 2, blocks: [0xCC00, 0xCC00, 0xCC00, 0xCC00], color: 'yellow'};
let s = {size: 3, blocks: [0x06C0, 0x8C40, 0x6C00, 0x4620], color: 'green'};
let t = {size: 3, blocks: [0x0E40, 0x4C40, 0x4E00, 0x4640], color: 'purple'};
let z = {size: 3, blocks: [0x0C60, 0x4C80, 0xC600, 0x2640], color: 'red'};

function eachblock(type, x, y, dir, fn) {
    let bit, result, row = 0, col = 0, blocks = type.blocks[dir];
    for (bit = 0x8000; bit > 0; bit = bit >> 1) {
        if (blocks & bit) {
            fn(x + col, y + row);
        }
        if (++col === 4) {
            col = 0;
            ++row;
        }
    }
}

function occupied(type, x, y, dir) {
    let result = false
    eachblock(type, x, y, dir, function (x, y) {
        if ((x < 0) || (x >= nx) || (y < 0) || (y >= ny) || getBlock(x, y))
            result = true;
    });
    return result;
}

function unoccupied(type, x, y, dir) {
    return !occupied(type, x, y, dir);
}

//-----------------------------------------
// start with 4 instances of each piece and
// pick randomly until the 'bag is empty'
//-----------------------------------------
let pieces = [];

function randomPiece() {
    if (pieces.length === 0)
        pieces = [i, i, i, i, j, j, j, j, l, l, l, l, o, o, o, o, s, s, s, s, t, t, t, t, z, z, z, z];
    let type = pieces.splice(random(0, pieces.length - 1), 1)[0];
    return {type: type, dir: DIR.UP, x: Math.round(random(0, nx - type.size)), y: 0};
}

window.setInterval(eyeball, 500);

function run() {
    showStats(); // initialize FPS counter
    addEvents(); // attach keydown and resize events
    let now;
    let last = now = timestamp();

    function frame() {
        now = timestamp();
        update(Math.min(1, (now - last) / 1000.0));
        draw();
        stats.update();
        last = now;
        requestAnimationFrame(frame, canvas);
    }

    resize();
    reset();
    frame();
}

function showStats() {
    stats.domElement.id = 'stats';
    get('menu').appendChild(stats.domElement);
}

function addEvents() {
    document.addEventListener('keydown', keydown, false);
    window.addEventListener('resize', resize, false);
}

function resize(event) {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    ucanvas.width = ucanvas.clientWidth;
    ucanvas.height = ucanvas.clientHeight;
    holdCanvas.width = holdCanvas.clientWidth;
    holdCanvas.height = holdCanvas.clientHeight;
    dx = canvas.width / nx;
    dy = canvas.height / ny;
    invalidate();
    invalidateNext();
}

function eyeball() {
    let dir = JSON.parse(getEyeData())["direction"];
    let handled = false;
    if (playing) {
        switch (dir) {
            case "left":
                actions.push(DIR.LEFT);
                handled = true;
                break;
            case "right":
                actions.push(DIR.RIGHT);
                handled = true;
                break;
            case "center":
                actions.push(DIR.DOWN);
                handled = true;
                break;
            case "nod":
                actions.push(DIR.UP);
                handled = true;
                break;
        }
    }
}

function keydown(ev) {
    let handled = false;
    if (playing) {
        switch (ev.keyCode) {
            case KEY.LEFT:
                actions.push(DIR.LEFT);
                handled = true;
                break;
            case KEY.RIGHT:
                actions.push(DIR.RIGHT);
                handled = true;
                break;
            case KEY.UP:
                actions.push(DIR.UP);
                handled = true;
                break;
            case KEY.DOWN:
                actions.push(DIR.DOWN);
                handled = true;
                break;
            case KEY.ESC:
                lose();
                handled = true;
                break;
            case KEY.SHIFT:
                swap();
                handled = true;
                break;
        }
    } else if (ev.keyCode === KEY.SPACE) {
        play();
        handled = true;
    }
    if (handled)
        ev.preventDefault();
}

function play() {
    hide('start');
    reset();
    playing = true;
}

function lose() {
    show('start');
    setVisualScore();
    playing = false;
}

function setVisualScore(n) {
    vscore = n || score;
    invalidateScore();
}

function setScore(n) {
    score = n;
    setVisualScore(n);
}

function addScore(n) {
    score = score + n;
}

function clearScore() {
    setScore(0);
}

function clearRows() {
    setRows(0);
}

function setRows(n) {
    rows = n;
    step = Math.max(speed.min, speed.start - (speed.decrement * rows));
    invalidateRows();
}

function addRows(n) {
    setRows(rows + n);
}

function getBlock(x, y) {
    return (blocks && blocks[x] ? blocks[x][y] : null);
}

function setBlock(x, y, type) {
    canSwap = true;
    blocks[x] = blocks[x] || [];
    blocks[x][y] = type;
    invalidate();
}

function clearBlocks() {
    blocks = [];
    invalidate();
}

function clearActions() {
    actions = [];
}

function setCurrentPiece(piece) {
    current = piece || randomPiece();
    invalidate();
}

function setNextPiece() {
    next = randomPiece();
    invalidateNext();
}

function reset() {
    dt = 0;
    clearActions();
    clearBlocks();
    clearRows();
    clearScore();
    setCurrentPiece(next);
    setNextPiece();
}

function update(idt) {
    if (playing) {
        if (vscore < score)
            setVisualScore(vscore + 1);
        handle(actions.shift());
        dt = dt + idt;
        if (dt > step) {
            dt = dt - step;
            drop();
        }
    }
}

function handle(action) {
    switch (action) {
        case DIR.LEFT:
            move(DIR.LEFT);
            break;
        case DIR.RIGHT:
            move(DIR.RIGHT);
            break;
        case DIR.UP:
            rotate();
            break;
        case DIR.DOWN:
            drop();
            break;
        case DIR.SWAP:
            swap();
            break;
    }
}


function swap() {
    if (canSwap) {
        canSwap = false;
        let temp = hold;
        current.x = 5;
        current.y = 0;
        hold = current;
        drawHold();
        if (temp != null) {
            current = temp;
        } else {
            current = next;
            drawNext();
        }
    }
}

function move(dir) {
    let x = current.x, y = current.y;
    switch (dir) {
        case DIR.RIGHT:
            x = x + 1;
            break;
        case DIR.LEFT:
            x = x - 1;
            break;
        case DIR.DOWN:
            y = y + 1;
            break;
    }
    if (unoccupied(current.type, x, y, current.dir)) {
        current.x = x;
        current.y = y;
        invalidate();
        return true;
    } else {
        return false;
    }
}

function rotate() {
    let newdir = (current.dir === DIR.MAX ? DIR.MIN : current.dir + 1);
    if (unoccupied(current.type, current.x, current.y, newdir)) {
        current.dir = newdir;
        invalidate();
    }
}

function drop() {
    if (!move(DIR.DOWN)) {
        addScore(10);
        dropPiece();
        removeLines();
        setCurrentPiece(next);
        setNextPiece();
        clearActions();
        if (occupied(current.type, current.x, current.y, current.dir)) {
            lose();
        }
    }
}

function dropPiece() {
    eachblock(current.type, current.x, current.y, current.dir, function (x, y) {
        setBlock(x, y, current.type);
    });
}

function removeLines() {
    let x, y, complete, n = 0;
    for (y = ny; y > 0; --y) {
        complete = true;
        for (x = 0; x < nx; ++x) {
            if (!getBlock(x, y))
                complete = false;
        }
        if (complete) {
            removeLine(y);
            y = y + 1;
            n++;
        }
    }
    if (n > 0) {
        addRows(n);
        addScore(100 * Math.pow(2, n - 1)); // 1: 100, 2: 200, 3: 400, 4: 800
    }
}

function removeLine(n) {
    let x, y;
    for (y = n; y >= 0; --y) {
        for (x = 0; x < nx; ++x)
            setBlock(x, y, (y === 0) ? null : getBlock(x, y - 1));
    }
}

let invalid = {};

function invalidate() {
    invalid.court = true;
}

function invalidateNext() {
    invalid.next = true;
}

function invalidateScore() {
    invalid.score = true;
}

function invalidateRows() {
    invalid.rows = true;
}

function draw() {
    ctx.save();
    ctx.lineWidth = 1;
    ctx.translate(0.5, 0.5);
    drawCourt();
    drawNext();
    drawScore();
    drawRows();
    ctx.restore();
}

function drawCourt() {
    if (invalid.court) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (playing)
            drawPiece(ctx, current.type, current.x, current.y, current.dir);
        let x, y, block;
        for (y = 0; y < ny; y++) {
            for (x = 0; x < nx; x++) {
                if (block = getBlock(x, y))
                    drawBlock(ctx, x, y, block.color);
            }
        }
        ctx.strokeRect(0, 0, nx * dx - 1, ny * dy - 1); // court boundary
        invalid.court = false;
    }
}

function drawNext() {
    if (invalid.next) {
        let padding = (nu - next.type.size) / 2;
        uctx.save();
        uctx.translate(0.5, 0.5);
        uctx.clearRect(0, 0, nu * dx, nu * dy);
        drawPiece(uctx, next.type, padding, padding, next.dir);
        uctx.strokeStyle = 'black';
        uctx.strokeRect(0, 0, nu * dx - 1, nu * dy - 1);
        uctx.restore();
        invalid.next = false;
    }
}

function drawHold() {
    if (!!hold) {
        let padding = (nu - next.type.size) / 2;
        holdctx.save();
        holdctx.translate(0.5, 0.5);
        holdctx.clearRect(0, 0, nu * dx, nu * dy);
        drawPiece(holdctx, hold.type, padding, padding, hold.dir);
        holdctx.strokeStyle = 'black';
        holdctx.strokeRect(0, 0, nu * dx - 1, nu * dy - 1);
        holdctx.restore();
        invalid.next = false;
    }
}

function drawScore() {
    if (invalid.score) {
        html('score', ("00000" + Math.floor(vscore)).slice(-5));
        invalid.score = false;
    }
}

function drawRows() {
    if (invalid.rows) {
        html('rows', rows);
        invalid.rows = false;
    }
}

function drawPiece(ctx, type, x, y, dir) {
    eachblock(type, x, y, dir, function (x, y) {
        drawBlock(ctx, x, y, type.color);
    });
}

function drawBlock(ctx, x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x * dx, y * dy, dx, dy);
    ctx.strokeRect(x * dx, y * dy, dx, dy)
}

run();