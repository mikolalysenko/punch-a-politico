function dup (x) {
  return x.map(function (y) {
    return y.slice()
  })
}

function cmp2 (a, b) {
  return a[0] - b[0] || a[1] - b[1]
}

function Link (s, t, l) {
  this.s = s
  this.t = t
  this.l = l
}

function dist (a, b) {
  return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2))
}

function createInitialState (points, cells) {
  var edges = []
  for (var i = 0; i < cells.length; ++i) {
    var c = cells[i]
    for (var j = 0; j < c.length; ++j) {
      var s = c[j]
      var t = c[(j + 1) % c.length]
      edges.push([Math.min(s, t), Math.max(s, t)])
    }
  }
  edges.sort(cmp2)
  var links = []
  for (var k = 0; k < edges.length;) {
    var e = edges[k]
    var a = e[0]
    var b = e[1]
    while (k < edges.length &&
      edges[k][0] === a &&
      edges[k][1] === b) {
      ++k
    }
    links.push(new Link(a, b, dist(points[a], points[b])))
  }

  return {
    position: [
      dup(points),
      dup(points)
    ],
    forces: points.map(function () { return [0, 0] }),
    cells: cells,
    links: links,
    rest: dup(points)
  }
}

function stepSimulation (state, params) {
  var positions = state.position
  var forces = state.forces
  var rest = state.rest
  var p0 = positions[0]
  var p1 = positions[1]

  var damping = params.damping
  var solveSteps = params.solveSteps
  var restoreForce = params.restore

  for (var j = 0; j < p0.length; ++j) {
    var x0 = p0[j]
    var x1 = p1[j]
    var f = forces[j]
    var r = rest[j]

    for (var k = 0; k < 2; ++k) {
      var x = x0[k]
      var v = x - x1[k]
      x0[k] = x + damping * v + f[k] + restoreForce * (r[k] - x)
      x1[k] = x
      f[k] = 0
    }
  }

  var links = state.links
  for (var N = 0; N < solveSteps; ++N) {
    for (var i = 0; i < links.length; ++i) {
      var c = links[i]
      var s = p0[c.s]
      var t = p0[c.t]
      var lr = c.l

      var d0 = s[0] - t[0]
      var d1 = s[1] - t[1]
      var ls = Math.sqrt(Math.pow(d0, 2) + Math.pow(d1, 2))

      var ff = 0.5 * (lr - ls) / ls
      s[0] += ff * d0
      s[1] += ff * d1
      t[0] -= ff * d0
      t[1] -= ff * d1
    }
  }
}

function applyPunch (state, origin, force, radius) {
  var ox = origin[0]
  var oy = origin[1]
  var fx = force[0]
  var fy = force[1]
  var forces = state.forces
  var p = state.position[0]
  var r2 = radius * radius
  for (var i = 0; i < p.length; ++i) {
    var x = p[i]
    var d2 = Math.pow(x[0] - ox, 2) + Math.pow(x[1] - oy, 2)
    var w = Math.exp(-d2 / r2)
    var f = forces[i]
    f[0] += w * fx
    f[1] += w * fy
  }
}

module.exports = {
  create: createInitialState,
  step: stepSimulation,
  punch: applyPunch
}
