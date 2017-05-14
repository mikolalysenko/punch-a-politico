const regl = require('regl')()
const vec2 = require('vec2')
const segment2 = require('segment2')
const segCrosses = require('robust-segment-intersect')
const triangulate = require('cdt2d')
const mouseChange = require('mouse-change')
const skeleton = require('simplicial-complex').skeleton
const simulate = require('./simulate')

const SELECT_RADIUS = 0.05

const IOTA = regl.buffer((() => {
  const result = []
  for (var i = 0; i < 65536; ++i) {
    result[i] = i
  }
  return result
})())

const state = {
  points: [],
  edges: [],
  interiorCells: [],
  exteriorCells: [],
  lastButtons: 0,
  highlightPoint: -1,
  startPoint: -1,
  highlightEdge: -1,
  activeEdge: null,
  simulate: false,
  damping: 0.999,
  solveSteps: 4,
  restore: 0.001,
  simState: {}
}

function exportJSON () {
  console.log(JSON.stringify({
    damping: state.damping,
    solveSteps: state.solveSteps,
    restore: state.restore,
    points: state.points,
    cells: state.interiorCells
  }))
}

require('control-panel')([
  { type: 'checkbox', label: 'simulate', initial: false },
  { type: 'range', label: 'damping', min: 0, max: 1, initial: 0.99 },
  { type: 'range', label: 'solveSteps', min: 0, max: 32, initial: 4 },
  { type: 'range', label: 'restore', min: 0, max: 1, initial: 0.01 },
  { type: 'range', label: 'punch', min: 0, max: 2, initial: 0.01 },
  { type: 'button', label: 'export', action: exportJSON }
]).on('input', (data) => {
  Object.keys(data).forEach(function (item) {
    state[item] = data[item]
  })

  if ('simulate' in data) {
    if (state.simulate) {
      state.simState = simulate.create(state.points, state.interiorCells)
    }
  }
})

function edgeDistance (a, b, c) {
  var p = vec2(c[0], c[1])
  return segment2(vec2(a[0], a[1]), vec2(b[0], b[1])).closestPointTo(p).distance(p)
}

function isValidEdge (a, b) {
  for (let i = 0; i < state.edges.length; ++i) {
    const e = state.edges[i]
    if (e[0] < 0 || e[1] < 0) {
      continue
    }
    const p = state.points[e[0]]
    const q = state.points[e[1]]
    if ((p === a && q !== b) ||
        (p === b && q !== a) ||
        (q === a && p !== b) ||
        (q === b && p !== a)) {
      continue
    }
    if (segCrosses(a, b, p, q)) {
      return false
    }
  }
  for (let i = 0; i < state.points.length; ++i) {
    const p = state.points[i]
    if (p === a || p === b) {
      continue
    }
    if (segCrosses(a, b, p, p)) {
      return false
    }
  }
  return true
}

function updateCells () {
  state.interiorCells = triangulate(state.points, state.edges, {
    delaunay: true,
    interior: true,
    exterior: false,
    infinity: false
  })
  state.exteriorCells = triangulate(state.points, state.edges, {
    delaunay: true,
    exterior: true,
    interior: false,
    infinity: false
  })
}

function handleSimInput (buttons, x, y) {
  if (buttons) {
    simulate.punch(state.simState, [
      2 * x / window.innerWidth - 1,
      1 - 2 * y / window.innerHeight
    ], [
      state.punch * (Math.random() - 0.5),
      state.punch * (Math.random() - 0.5)
    ],
    0.1)
  }
}

mouseChange(regl._gl.canvas, function (buttons, x, y) {
  if (state.simulate) {
    return handleSimInput(buttons, x, y)
  }

  var i, j
  const width = window.innerWidth
  const height = window.innerHeight
  const lx = 2 * x / width - 1
  const ly = 1 - 2 * y / height
  var closestDist = SELECT_RADIUS
  state.highlightPoint = -1
  state.highlightEdge = -1
  for (i = 0; i < state.points.length; ++i) {
    var p = state.points[i]
    const d2 = Math.sqrt(Math.pow(lx - p[0], 2) + Math.pow(ly - p[1], 2))
    if (d2 < closestDist) {
      state.highlightPoint = i
      closestDist = d2
    }
  }

  if (state.highlightPoint < 0) {
    for (i = 0; i < state.edges.length; ++i) {
      var e = state.edges[i]
      if (e[0] < 0 || e[1] < 0) {
        continue
      }
      const d2 = edgeDistance(state.points[e[0]], state.points[e[1]], [lx, ly])
      if (d2 < closestDist) {
        state.highlightEdge = i
        closestDist = d2
      }
    }
  }

  if (!state.lastButtons && !!buttons) {
    if (state.highlightEdge >= 0) {
      state.edges.splice(state.highlightEdge, 1)
      state.highlightEdge = -1
      updateCells()
    } else if (state.highlightPoint < 0) {
      state.points.push([lx, ly])
      updateCells()
    } else {
      state.startPoint = state.highlightPoint
      state.activeEdge = [ state.points[state.highlightPoint], [lx, ly] ]
    }
  } else if (!!state.lastButtons && !buttons) {
    if (state.startPoint >= 0) {
      if (state.highlightPoint === state.startPoint) {
        state.points.splice(state.highlightPoint, 1)
        var nedges = []
discard_edge:
        for (i = 0; i < state.edges.length; ++i) {
          const e = state.edges[i]
          for (j = 0; j < 2; ++j) {
            if (e[j] > state.highlightPoint) {
              e[j] -= 1
            } else if (e[j] === state.highlightPoint) {
              continue discard_edge
            }
          }
          nedges.push(e)
        }
        state.edges = nedges
        state.highlightPoint = -1
        updateCells()
      } else if (state.highlightPoint >= 0) {
        if (isValidEdge(
          state.points[state.startPoint],
          state.points[state.highlightPoint])) {
          state.edges.push([state.startPoint, state.highlightPoint])
          updateCells()
        }
      }
      state.startPoint = -1
      state.activeEdge = null
    }
  } else if (buttons) {
    if (state.activeEdge) {
      state.activeEdge[1] = [lx, ly]
    }
  }
  state.lastButtons = buttons
})

require('resl')({
  manifest: {
    trump: {
      src: './trump.jpg',
      type: 'image',
      parser: (img) => regl.texture({
        data: img,
        flipY: true,
        min: 'linear',
        mag: 'linear'
      })
    }
  },

  onDone ({trump}) {
    const drawImage = regl({
      frag: `
      precision highp float;
      uniform sampler2D headImage;
      varying vec2 uv;
      void main () {
        gl_FragColor = texture2D(headImage, uv);
      }
      `,

      vert: `
      precision highp float;
      attribute vec2 position;
      varying vec2 uv;
      void main () {
        uv = 0.5 * (position + 1.);
        gl_Position = vec4(position, 0, 1);
      }
      `,

      attributes: {
        position: [
          -4, 0,
          4, 4,
          4, -4
        ]
      },

      count: 3,

      uniforms: {
        headImage: trump
      }
    })

    const drawPoints = regl({
      vert: `
      precision highp float;
      attribute vec2 position;
      attribute float id;
      uniform float highlightPoint;
      varying vec3 color;
      void main () {
        color = mix(
          vec3(0, 1, 0),
          vec3(1, 0, 0),
          step(abs(highlightPoint - id), 0.1));
        gl_PointSize = 16.0;
        gl_Position = vec4(position, 0, 1);
      }
      `,

      frag: `
      precision highp float;
      varying vec3 color;
      void main () {
        float d = length(gl_PointCoord.xy - 0.5);
        if (d > 0.5) {
          discard;
        }
        gl_FragColor = vec4(color, 1);
      }
      `,

      attributes: {
        position: regl.prop('points'),
        id: IOTA
      },

      uniforms: {
        highlightPoint: regl.prop('highlightPoint')
      },

      count: (_, {points}) => points.length,

      primitive: 'points'
    })

    const drawEdges = regl({
      frag: `
      precision highp float;
      uniform vec3 color;
      void main () {
        gl_FragColor = vec4(color, 1);
      }
      `,

      vert: `
      precision highp float;
      attribute vec2 position;
      void main () {
        gl_Position = vec4(position, 0, 1);
      }`,

      attributes: {
        position: regl.prop('positions')
      },

      uniforms: {
        color: regl.prop('color')
      },

      elements: regl.prop('edges')
    })

    const drawLine = regl({
      frag: `
      precision highp float;
      uniform vec3 color;
      void main () {
        gl_FragColor = vec4(color, 1);
      }
      `,

      vert: `
      precision highp float;
      attribute float t;
      uniform vec2 points[2];
      void main () {
        gl_Position = vec4(mix(points[0], points[1], t), 0, 1);
      }
      `,

      attributes: {
        t: [0, 1]
      },

      uniforms: {
        'points[0]': regl.prop('points[0]'),
        'points[1]': regl.prop('points[1]'),
        'color': regl.prop('color')
      },

      offset: 0,
      count: 2,
      primitive: 'lines'
    })

    function renderEditor () {
      if (state.activeEdge) {
        drawLine({
          points: state.activeEdge,
          color: [1, 0, 0]
        })
      }
      if (state.highlightEdge >= 0) {
        const [ii, jj] = state.edges[state.highlightEdge]
        drawLine({
          points: [
            state.points[ii],
            state.points[jj]
          ],
          color: [1, 0, 0]
        })
      }

      drawPoints(state)
      drawEdges({
        positions: state.points,
        edges: state.edges,
        color: [0, 1, 0]
      })
      drawEdges({
        positions: state.points,
        edges: skeleton(state.interiorCells, 1),
        color: [0, 0.5, 1]
      })
      drawEdges({
        positions: state.points,
        edges: skeleton(state.exteriorCells, 1),
        color: [1, 0.5, 0]
      })

      drawImage()
    }

    const drawSimulation = regl({
      attributes: {
        restUV: regl.prop('rest'),
        position: regl.prop('position[0]')
      },

      elements: regl.prop('cells'),

      frag: `
      precision highp float;
      varying vec2 uv;
      uniform sampler2D baseImage;
      void main () {
        gl_FragColor = texture2D(baseImage, uv);
      }
      `,

      vert: `
      precision highp float;
      attribute vec2 restUV, position;
      varying vec2 uv;
      void main () {
        uv = 0.5 * (1. + restUV);
        gl_Position = vec4(position, 0, 1);
      }
      `,

      uniforms: {
        baseImage: trump
      }
    })

    function renderSimulation () {
      drawSimulation(state.simState)
      simulate.step(state.simState, state)
    }

    regl.frame(() => {
      regl.clear({
        color: [0, 0, 0, 1],
        depth: 1
      })

      if (state.simulate) {
        renderSimulation()
      } else {
        renderEditor()
      }
    })
  }
})
