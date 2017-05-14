const regl = require('regl')()
const simulate = require('./simulate')
const geometry = require('./trump.json')

const IMAGE_SRC = './trump.jpg'
const SCALE = 1.125

require('resl')({
  manifest: {
    politician: {
      src: IMAGE_SRC,
      type: 'image',
      parser: (img) => regl.texture({
        data: img,
        min: 'linear',
        mag: 'linear'
      })
    }
  },

  onDone ({politician}) {
    const state = simulate.create(geometry.points, geometry.cells)

    const verts = regl.buffer(state.position[0])
    const bruiseData = new Float32Array(state.rest.length)
    const bruise = regl.buffer(bruiseData)

    const imageAspect = politician.width / politician.height

    function aspect () {
      return regl._gl.drawingBufferWidth / (imageAspect * regl._gl.drawingBufferHeight)
    }

    const drawPolitician = regl({
      attributes: {
        position: verts,
        uv: state.rest.map((uv) => [
          0.5 * (uv[0] + 1),
          0.5 * (1 - uv[1])
        ]),
        bruise
      },

      elements: state.cells,

      frag: `
      precision highp float;
      uniform sampler2D politician;
      varying vec2 vuv;
      varying float vbruise;
      void main () {
        gl_FragColor = mix(
          texture2D(politician, vuv),
          vec4(0.9, 0.1, 0.4, 1),
          vbruise);
      }
      `,

      vert: `
      precision highp float;
      attribute vec2 position, uv;
      attribute float bruise;
      varying vec2 vuv;
      varying float vbruise;
      uniform float aspect;
      void main () {
        vuv = uv;
        vbruise = bruise;
        gl_Position = vec4(vec2(${SCALE}, aspect * ${SCALE}) * position, 0, 1);
      }
      `,

      uniforms: {
        politician,
        aspect
      }
    })

    function mouseCoord ({clientX, clientY}) {
      return [
        2 * clientX / (SCALE * window.innerWidth) - 1,
        (1 - 2 * clientY / (SCALE * window.innerHeight)) / aspect()
      ]
    }

    var mouse = [0, 0]
    var vx = 0
    var vy = 0
    window.addEventListener('mousemove', (ev) => {
      var cur = mouseCoord(ev)
      vx = 0.5 * vx + 0.5 * (cur[0] - mouse[0])
      vy = 0.5 * vy + 0.5 * (cur[1] - mouse[1])
      mouse = cur
    })
    window.addEventListener('click', (ev) => {
      var mouse = mouseCoord(ev)
      simulate.punch(state, mouse, [
        2 * vx + 0.5 * (Math.random() - 0.5),
        2 * vy + 0.5 * (Math.random() - 0.5)
      ], 0.25 + Math.pow(vx, 2) + Math.pow(vy, 2))
      vx = 0
      vy = 0

      for (var i = 0; i < state.rest.length; ++i) {
        var p = state.position[0][i]
        var d2 =
          Math.pow(p[0] - mouse[0], 2) +
          Math.pow(p[1] - mouse[1], 2)
        bruiseData[i] = Math.min(1,
          bruiseData[i] + 0.1 * Math.exp(-40.0 * d2))
      }
      bruise(bruiseData)
    })

    regl.frame(() => {
      simulate.step(state, {
        damping: 0.9,
        solveSteps: 1,
        restore: 0.1
      })

      // enforce boundary conditions on bottom half of mesh
      for (var i = 0; i < state.rest.length; ++i) {
        var r = state.rest[i]
        if (r[1] < -0.5) {
          var p = state.position[0][i]
          p[0] = r[0]
          p[1] = r[1]
        }
      }

      verts.subdata(state.position[0])

      regl.clear({
        color: [0, 0, 0, 0],
        depth: 1
      })
      drawPolitician()
    })
  }
})
