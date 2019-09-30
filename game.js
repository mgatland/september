/* eslint-disable no-console */
'use strict'

import { editor } from './editor.js'
import { playSound } from './sounds.js'
let audioInitialized = false

const smallSprite = 24
const fontSize = 24
const lineHeight = 32
const blankLineCharDelay = 130
let mousePos = { x: 0, y: 0 }

class Player {
  constructor (x, y) {
    this.isPlayer = true
    this.pos = { x, y }
    this.vel = { x: 0, y: 0 }
    this.facingLeft = false
    this.checkpoints = {}
    this.trail = []
    this.score = 0
    this.fireTimer = 0
    this.refireRate = 6
    this.ammo = 0
    this.maxAmmo = 100
    this.health = 0
    this.maxHealth = 1
    this.ammo = this.maxAmmo
    this.health = this.maxHealth
  }
}

const particleTypes = {
  playerDeadPuff: { maxAge: 300, sprite: smallSprite + 4 },
  playerDeadRing: { maxAge: 1, sprite: smallSprite + 4, spawns: [{ type: 'playerDeadPuff', amount: 13, force: 0.75 }, { type: 'playerDeadPuff', amount: 19, force: 0.3 }] },
  expPuff: { maxAge: 14, sprite: smallSprite + 5 },
  expRing: { maxAge: 1, sprite: smallSprite + 5, spawns: [{ type: 'expPuff', amount: 6, force: 1 }] },
  spawnerDeadPuff1: { maxAge: 30, sprite: smallSprite + 7 },
  spawnerDeadPuff2: { maxAge: 90, sprite: smallSprite + 11 },
  spawnerDeadRing: { maxAge: 1, sprite: smallSprite + 7, spawns: [{ type: 'spawnerDeadPuff1', amount: 7, force: 1.5 }, { type: 'spawnerDeadPuff1', amount: 5, force: 1 }, { type: 'spawnerDeadPuff2', amount: 11, force: 0.5 }] },
  enemyDeadPuff1: { maxAge: 25, sprite: smallSprite + 7 },
  enemyDeadPuff2: { maxAge: 30, sprite: smallSprite + 11 },
  enemyDeadRing: { maxAge: 1, sprite: smallSprite + 7, spawns: [{ type: 'enemyDeadPuff1', amount: 7, force: 1.5 }, { type: 'enemyDeadPuff2', amount: 11, force: 0.5 }] }
}

let debugMode = false
window.editMode = false

const storageKey = 'temp'

let frame = 0
const shots = []
const ents = []
let localId

let player

let spawnerId = 0
let state = { page: 'intro', active: true, titleCardCharacter: 0 }

const keys = { left: false, right: false, cheat: false, up: false, down: false, shoot: false, shootHit: false }

class Enemy {
  constructor (x, y, parentId = -1) {
    this.pos = { x, y }
    this.vel = { x: 0, y: 0 }
    this.parentId = parentId
    this.fireTimer = 0
    this.refireRate = 0
    this.facingLeft = false
    this.fireMode = 'star'
    this.moveTimer = 0
    this.maxMoveTimer = 90
    this.fireSequence = frame % 16
    this.health = 30
    this.maxHealth = 30
    this.sprite = 2
    this.deadEffect = 'enemyDeadRing'
    this.hurtsOnTouch = true
  }
  move () {
    if (this.fireTimer > 0) this.fireTimer--
    if (this.fireTimer === 0 && this.refireRate > 0) {
      spawnShot(this)
      playSound('enemyshoot')
      this.fireTimer = this.refireRate
    }
    if (!player.dead && this.hurtsOnTouch && isTouching(this, player)) {
      if (!player.winner) hurt(player, 10)
      playSound('playerhit')
      // hurt(this, 9000)
    }
  }
  _startRandomMove (chasePlayer) {
    let angle
    if (chasePlayer && !player.dead && Math.random() > 0.9) {
      angle = getAngle(this.pos, player.pos)
    } else {
      angle = Math.random() * Math.PI * 2
    }

    const speed = 0.6
    this.vel.x = Math.cos(angle) * speed
    this.vel.y = Math.sin(angle) * speed
    this.moveTimer = this.maxMoveTimer
  }
  inActiveRange () {
    return distance(this.pos, player.pos) < tileSize * 9
  }
  draw () {
    drawSprite(this.sprite, this.pos.x, this.pos.y)
  }
}

class Beamer extends Enemy {
  constructor (x, y) {
    super(x, y)
    this.state = 'done'
    this.timer = 150
    this.health = 200
    this.maxHealth = 200
    this.deadEffect = 'spawnerDeadRing'
    this.baseSprite = 21
    this.spawnerId = spawnerId++
    this.targetPos = { x: 0, y: 0 }
  }
  move () {
    this.sprite = this.baseSprite + Math.floor(frame / 15) % 2
    if (this.timer > 0) {
      this.timer--
      if (this.timer === 0) {
        if (this.state === 'aim') {
          this.state = 'charge'
          this.timer = 30
        } else if (this.state === 'charge') {
          this.state = 'done'
          this.timer = 60
          this.shoot()
          playSound('spawn')
        } else if (this.state === 'done') {
          this.state = 'aim'
          this.timer = 90
        }
      }

      if (this.state === 'aim') {
        this.targetPos.x = player.pos.x
        this.targetPos.y = player.pos.y
      }
    }
    super.move()
  }
  shoot () {
    const beam = this.getBeam(true)
    for (let b of beam) {
      const shot = {
        pos: { x: b.x, y: b.y },
        vel: { x: 0, y: 0 }
      }
      shot.hurtsPlayer = true
      shot.age = 0
      shots.push(shot)
    }
  }
  getBeam (isLong = false) {
    const dist = isLong ? 300 : distance(this.pos, this.targetPos)
    const spacing = 8
    const particles = Math.floor(dist / spacing) - 2
    const angle = getAngle(this.pos, this.targetPos)
    const tempPos = { x: this.pos.x, y: this.pos.y }
    const dX = Math.cos(angle) * spacing
    const dY = Math.sin(angle) * spacing
    const result = []
    for (let i = 0; i < particles; i++) {
      tempPos.x += dX
      tempPos.y += dY
      result.push({ x: tempPos.x, y: tempPos.y })
    }
    return result
  }
  draw () {
    super.draw()
    if (this.state !== 'aim' && this.state !== 'charge') {
      return
    }
    const sprite = (this.state === 'aim') ? smallSprite : smallSprite + 1
    const beam = this.getBeam(this.state === 'charge')
    for (let b of beam) {
      drawSprite(sprite, b.x, b.y)
    }
  }
}

class Bouncer extends Enemy {
  constructor (x, y, sId) {
    super(x, y, sId)
    this.vel.x = 2
  }
  move () {
    this.sprite = 18 + Math.floor(frame / 18) % 3
    this.pos.x += this.vel.x
    this.pos.y += this.vel.y
    if (getCollidingTiles(this.pos)) {
      this.pos.x -= this.vel.x
      this.vel.x = -this.vel.x
    }
    super.move()
  }
}

const camera = {
  pos: { x: 0, y: 0 }
}

const checkpoints = [
]

const particles = []

const skyXVel = 1.5
const skyYVel = 1.5

const xAccel = 1
const xDecel = 1

const scale = 4
const tileSize = 16
let canvas
let ctx
let spriteImage

let savedMap = localStorage.getItem(storageKey)
let world = savedMap ? JSON.parse(savedMap) : {}
if (savedMap && false) {
  console.warn('Loading map from local storage. This is only for development use.')
  console.log(savedMap)
} else {
  /* eslint-disable comma-spacing */
  world =
  
  //{ 'width': 50, 'height': 50, 'map': [null,0,1,51,0,48,1,2,0,48,1,2,0,48,1,2,0,10,7,1,0,21,6,1,0,15,1,2,0,32,6,1,0,15,1,2,0,4,7,1,0,24,6,7,0,12,1,2,0,48,1,2,0,19,7,1,0,28,1,2,0,48,1,2,0,41,6,4,0,3,1,2,0,48,1,2,0,6,6,6,0,36,1,2,0,47,6,1,1,2,0,41,7,4,0,3,1,2,0,48,1,2,0,48,1,2,0,48,1,2,0,48,1,2,0,23,6,2,0,23,1,2,0,24,6,2,0,22,1,2,0,25,6,2,0,21,1,2,0,26,6,2,0,20,1,2,0,27,6,2,0,19,1,2,0,28,6,2,0,18,1,2,0,48,1,2,0,48,1,2,0,48,1,2,0,48,1,2,0,48,1,2,0,48,1,2,0,48,1,2,0,48,1,2,0,13,7,8,0,14,6,1,0,12,1,2,0,13,7,1,0,6,7,1,0,15,6,1,0,11,1,2,0,20,7,1,0,16,6,1,0,10,1,2,0,20,7,1,0,17,6,1,0,9,1,2,0,20,7,1,0,18,6,1,0,8,1,2,0,13,7,1,0,6,7,1,0,12,6,5,0,10,1,2,0,13,7,1,0,3,7,1,0,2,7,1,0,27,1,2,0,13,7,1,0,6,7,1,0,27,1,2,0,13,7,8,0,27,1,2,0,48,1,2,0,48,1,2,0,48,1,2,0,48,1,2,0,48,1,2,6,2,0,46,1,2,0,48,1,51,0,2] }
  { 'width': 19, 'height': 10, 'map': [6,13,1,6,7,1,0,17,7,2,0,17,7,2,0,17,7,2,0,17,7,2,0,17,7,2,0,17,7,2,0,17,7,2,0,17,7,20]} 
  /* eslint-enable comma-spacing */
}
world.map = editor.rleDecode(world.map)

function start () {
  canvas = document.querySelector('canvas')
  ctx = canvas.getContext('2d', { alpha: false })
  ctx.imageSmoothingEnabled = false
  const defaultFont = fontSize + "px 'uni 05_53'"
  ctx.font = defaultFont
  ctx.fillStyle = '#140C1C'
  ctx.baseLine = 'bottom'
  spriteImage = new Image()
  spriteImage.src = 'sprites.png'
  spriteImage.addEventListener('load', loaded, false)

}

function loaded () {
  editor.startEditor(canvas, scale, world, tileSize, player, storageKey, camera)
  tick()
}

function tick () {
  frame = (++frame % 3600)
  if (state.page === 'intro') {
    if (frame % 1 === 0) state.titleCardCharacter++
    if (keys.shootHit) {
      if (state.active) {
        state.titleCardCharacter = Number.MAX_SAFE_INTEGER
      } else {
        state.page = null
      }
    }
    keys.shootHit = false
  } else if (state.page === 'endCard') {
    if (frame % 1 === 0) state.titleCardCharacter++
    if (keys.shootHit) {
      if (state.active) {
        state.titleCardCharacter = Number.MAX_SAFE_INTEGER
      } else {
        // You can't advance past this screen
      }
    }
    keys.shootHit = false
  } else {
    updatePlayer(player, keys)
    updateShots()
    updateEnts()
    updateParticles()
  }
  draw()
  requestAnimationFrame(tick)
}

function isTouching (ent1, ent2) {
  // Very dirty hack to handle the player being smaller than other sprites.
  const dist = (ent1 === player || ent2 === player) ? tileSize / 2 : tileSize
  return distance(ent1.pos, ent2.pos) < dist
}

function distance (pos1, pos2) {
  const dX = pos1.x - pos2.x
  const dY = pos1.y - pos2.y
  return Math.sqrt(dX * dX + dY * dY)
}

function tilePosToWorld (tilePos) {
  return { x: tilePos.x * tileSize, y: tilePos.y * tileSize }
}

function spawnExplosion (pos, type = 'expRing') {
  const p = { x: pos.x, y: pos.y, age: 0, type }
  p.xVel = 0
  p.yVel = 0
  particles.push(p)
}

function hurt (ent, amount) {
  if (ent.health <= 0) return
  ent.health -= amount
  if (ent.health <= 0) {
    ent.health = 0
    ent.dead = true
    if (ent.isPlayer) {
      spawnExplosion(ent.pos, 'playerDeadRing')
      playSound('playerexp')
    } else {
      spawnExplosion(ent.pos, ent.deadEffect)
      playSound('exp2')
    }
  }
  if (ent.isPlayer) {
    player.healthBarFlashTimer = 60
  }
}

function updateShots () {
  for (let shot of shots) {
    shot.pos.x += shot.vel.x
    shot.pos.y += shot.vel.y
    shot.age++

    if (!player.dead && shot.hurtsPlayer && isTouching(shot, player)) {
      hurt(player, 10)
      playSound('playerhit')
      playSound('exp')
      spawnExplosion(shot.pos)
      shot.dead = true
      continue
    }

    if (shot.hurtsPlayer && shot.age > 20) {
      shot.dead = true
    }

    if (!shot.hurtsPlayer) {
      for (const ent of ents) {
        if (isTouching(shot, ent)) {
          hurt(ent, 10)
          playSound('hit2')
          spawnExplosion(shot.pos)
          shot.dead = true
          continue
        }
      }
      if (shot.age > tileSize * 7 / Math.abs(shot.vel.x)) {
        spawnExplosion(shot.pos)
        shot.dead = true
        continue
      }
    }

    if (getCollidingTiles(shot.pos)) {
      shot.dead = true
      spawnExplosion(shot.pos)
      if (!shot.hurtsPlayer) {
        playSound('hitwall')
      }
    }
  }
  filterInPlace(shots, s => !s.dead)
}

function updateEnts () {
  for (let ent of ents) {
    ent.move()
    if (ent.trash && (distance(ent.pos, player.pos) > 240)) {
      ent.dead = true
    }
  }
  filterInPlace(ents, e => !e.dead)
}

function updateParticles () {
  for (let bit of particles) {
    const type = particleTypes[bit.type]
    bit.x += bit.xVel
    bit.y += bit.yVel
    bit.age++

    if (bit.age >= type.maxAge) {
      bit.dead = true
      if (type.spawns) {
        for (let spawns of type.spawns) {
          const amount = spawns.amount
          const newType = spawns.type
          const force = spawns.force
          for (let i = 0; i < amount; i++) {
            const p = { x: bit.x, y: bit.y, age: 0, type: newType }
            const angle = i / amount * Math.PI * 2
            p.xVel = force * Math.cos(angle)
            p.yVel = force * Math.sin(angle)
            particles.push(p)
          }
        }
      }
    }
  }

  filterInPlace(particles, bit => !bit.dead)
}

// https://stackoverflow.com/questions/37318808/what-is-the-in-place-alternative-to-array-prototype-filter
function filterInPlace (a, condition) {
  let i = 0
  let j = 0

  while (i < a.length) {
    const val = a[i]
    if (condition(val, i, a)) a[j++] = val
    i++
  }

  a.length = j
  return a
}

function draw () {
  if (state.page === 'intro') {
    drawIntroCard()
    return
  }
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  drawLevel()
  particles.forEach(p => drawParticle(p, false, true))
  if (!debugMode) drawPlayer(player)
  for (let shot of shots) {
    drawShot(shot)
  }
  for (let ent of ents) {
    ent.draw()
  }
  drawHUD()
}

function drawHUD () {
  const height = 60
  const backgroundColor = ctx.fillStyle
  ctx.fillRect(0, canvas.height - height - scale, canvas.width, scale)
  ctx.fillStyle = '#757161'
  ctx.fillRect(0, canvas.height - height, canvas.width, height)
  ctx.fillStyle = backgroundColor

  function drawBar (current, max, isLeft, fullSprite, emptySprite) {
    let x = tileSize * scale * 1.5 + (isLeft ? 0 : canvas.width / 2)
    let y = canvas.height - height / 2
    for (let i = 0; i < max / 10; i++) {
      const sprite = i < current / 10 ? fullSprite : emptySprite
      drawSprite(sprite, x, y, false, true)
      x += tileSize * scale / 2
    }
  }
  // const sOffset = (player.healthBarFlashTimer > 0 && Math.floor(player.healthBarFlashTimer / 10) % 2 === 0) ? 8 : 2
  // drawBar(player.health, player.maxHealth, false, smallSprite + sOffset + 1, smallSprite + sOffset)

  const scores = ['Talc', 'Gypsum', 'Calcite', 'Fluorite', 'Apatite', 'Orthoclase feldspar', 'Quartz', 'Topaz', 'Corundum', 'Diamond']
  const scoreText = scores[player.score] || 'Diamond + ' + (player.score - scores.length + 1)

  // Goal text
  ctx.textAlign = 'left'
  ctx.textBaseline = 'bottom'
  const textHeight = canvas.height - (height / 2 - fontSize / 2)
  ctx.fillText(`Use arrow keys. Score: ${scoreText}.`, tileSize * scale, textHeight)
}

function drawParticle (p) {
  const type = particleTypes[p.type]
  //if (p.type. === 'ring') drawCheckpoint(p, false, true)
  drawSprite(type.sprite, p.x, p.y)
}

function drawShot (s) {
  drawSprite(s.hurtsPlayer ? smallSprite + 5 : smallSprite + 6, s.pos.x, s.pos.y)
}

function drawPlayer (player) {
  for (let bit of player.trail) {
    drawCheckpoint(bit, false)
  }

  if (!player.dead) {
    let sprite = 5
    drawSprite(sprite, player.pos.x, player.pos.y, player.facingLeft)
    // ctx.strokeText(Math.floor(player.pos.x / tileSize) + ":" + Math.floor(player.pos.y / tileSize), 40, 40)
  }
}

function drawSprite (index, x, y, flipped = false, hud = false) {
  let width = tileSize
  let height = tileSize
  if (!hud) {
    const camPos = camera.pos
    x = Math.floor((x - camPos.x) * scale)
    y = Math.floor((y - camPos.y) * scale)
    x += Math.floor(canvas.width / 2)
    y += Math.floor(canvas.height / 2)
  }
  ctx.translate(x, y)
  if (flipped) ctx.scale(-1, 1)

  let sX = (index % 8) * width
  let sY = Math.floor(index / 8) * height

  // hack for small sprites
  if (index >= smallSprite) {
    const smolIndex = index - smallSprite
    width /= 2
    height /= 2
    sX = smolIndex * width
    sY = 48
  }

  ctx.drawImage(spriteImage,
    sX, sY,
    width, height,
    -width / 2 * scale, -height / 2 * scale,
    width * scale, height * scale)
  if (flipped) ctx.scale(-1, 1)
  ctx.translate(-x, -y)
}

const hiddenSprites = [15, 16, 17, 2, 8]

function drawLevel () {
  const level = world.map
  const center = { x: camera.pos.x / tileSize, y: camera.pos.y / tileSize }
  const halfWidth = canvas.width / 2 / scale / tileSize
  const halfHeight = canvas.height / 2 / scale / tileSize
  const minY = Math.floor(center.y - halfHeight)
  const maxY = Math.floor(center.y + halfHeight + 1)
  const minX = Math.floor(center.x - halfWidth)
  const maxX = Math.floor(center.x + halfWidth + 1)
  for (let tY = minY; tY < maxY; tY++) {
    for (let tX = minX; tX < maxX; tX++) {
      const i = tX + tY * world.width
      const x = (i % world.width) + 0.5
      const y = Math.floor(i / world.width) + 0.5
      const sprite = level[i]
      if (!window.editMode && hiddenSprites.indexOf(sprite) >= 0) {
        drawSprite(0, x * tileSize, y * tileSize)
      } else {
        drawSprite(sprite, x * tileSize, y * tileSize)
      }
    }
  }
  for (let checkpoint of checkpoints) {
    drawCheckpoint({ x: checkpoint.x * tileSize, y: checkpoint.y * tileSize }, player.checkpoints[checkpoint.id])
  }
}

function drawCheckpoint (pos, isVacant) {
  const isFast = player.isCharging
  let anim = Math.floor(frame / (isFast ? 6 : 12)) % 4
  if (anim === 3) anim = 1
  if (isVacant) return
  const sprite = 8 + anim
  drawSprite(sprite, pos.x, pos.y)
}

function updatePlayerAxis (player, axis, moreKey, lessKey, maxVel) {
  let vel = player.vel[axis]

  if (moreKey) {
    if (vel < maxVel) {
      vel += xAccel
    } else {
      vel -= Math.min(vel - maxVel, xDecel)
    }
  } else if (lessKey) {
    if (vel > -maxVel) {
      vel -= xAccel
    } else {
      vel += Math.min(-vel - maxVel, xDecel)
    }
  } else if (!lessKey && vel < 0) vel += Math.min(-vel, xDecel)
  else if (!moreKey && vel > 0) vel -= Math.min(vel, xDecel)

  player.vel[axis] = vel
}

const levels = [{}, { type: 'beamer', x: 1.5, y: 1.5 }, { type: 'beamer', x: 8.5, y: 8.5 },
  { type: 'bouncer', x: 2.5, y: 6.5 }, { type: 'bouncer', x: 2.5, y: 3.5 }]

function levelUp () {
  const level = levels[player.score]
  if (level) {
    if (level.type === 'beamer') {
      ents.push(new Beamer(level.x * tileSize, level.y * tileSize))
    }
    if (level.type === 'bouncer') {
      ents.push(new Bouncer(level.x * tileSize, level.y * tileSize))
    }
  }
}

function updatePlayer (player, isLocal) {
  if (player.dead) {
    if (isLocal) {
      player.deadTimer = player.deadTimer ? player.deadTimer + 1 : 1
      if (player.deadTimer > 60 * 5) restart()
    }
    return
  }

  const keys = player.keys
  let isTouching = false

  if (keys.left) player.facingLeft = true
  if (keys.right) player.facingLeft = false

  if (player.winner) {
    player.winTimer++
    if (player.winTimer > 60 * 5) {
      state.page = 'endCard'
      state.active = true
      state.titleCardCharacter = 0
    }
  }

  updatePlayerAxis(player, 'x', keys.right, keys.left, skyXVel)
  player.pos.x += player.vel.x

  const collidingTile = getCollidingTiles(player.pos)
  if (collidingTile !== null) {
    isTouching = true
    const clearTileIndex = getIndexFromPixels(collidingTile.x, collidingTile.y) +
      (player.vel.x < 0 ? 1 : -1) // move player one tile left or right
    const { x: clearX } = getPixelsFromIndex(clearTileIndex)
    player.pos.x = clearX + tileSize / 2
    player.vel.x = 0
  }

  updatePlayerAxis(player, 'y', keys.down, keys.up, skyYVel)
  player.pos.y += player.vel.y

  const collidingTileY = getCollidingTiles(player.pos)
  if (collidingTileY !== null) {
    isTouching = true
    const clearTileIndex = getIndexFromPixels(collidingTileY.x, collidingTileY.y) +
      (player.vel.y < 0 ? world.width : -world.width) // move player one tile up or down
    const { y: clearY } = getPixelsFromIndex(clearTileIndex)
    player.pos.y = clearY + tileSize / 2
    player.vel.y = 0
  }

  if (player.fireTimer > 0) player.fireTimer--

  if (isLocal) {
    if (player.healthBarFlashTimer > 0) {
      player.healthBarFlashTimer--
    }

    /*if (player.winner) {
      spawnExplosion(player.pos)
    } else {
      if (ents.length === 0 && !player.winner) {
        player.winner = true
        player.winTimer = 0
      }
    }*/

    camera.pos.x = 149 // player.pos.x
    camera.pos.y = 87 // player.pos.y

/*    if (keys.shoot && player.fireTimer === 0 && player.ammo > 0) {
      spawnShot(player)
      playSound('shoot')
      player.fireTimer = player.refireRate
      // player.ammo--
    } */
    keys.shootHit = false

    for (let checkpoint of checkpoints) {
      const close = tileSize
      const dist = distance(player.pos, tilePosToWorld(checkpoint))
      if (dist < close) {
        player.healthBarFlashTimer = 120
        playSound('heal')
        player.score++
        if (checkpoint.x < 10) {
          checkpoint.x = 16.5
          checkpoint.y = 7.5
        } else {
          checkpoint.x = 2.5
          checkpoint.y = 2.5
        }
        levelUp()
      }
    }
  }

  if (player.lostCoins) {
    player.checkpoints = {}
    console.log('coins lost: ' + player.trail.length)
    for (let bit of player.trail) {
      particles.push(bit)
      bit.type = 'expPuff'
      bit.age = 0
      bit.xVel *= 2
      bit.yVel *= 2
      bit.xVel += (Math.random() - 0.5) * 4
      bit.yVel += (Math.random() - 0.5) * 4
    }
    player.trail.length = 0
  }
  delete player.lostCoins

  if (isLocal) {
    if (player.trail.length > 0) {
      if (isTouching) {
        player.lostCoins = true // for network updates
      }
    }
  }
  if (player.trail.length > 0) {
    let pos = { ...player.pos }
    for (let bit of player.trail) {
      const dist = getDist(bit, pos)
      const angle = getAngle(bit, pos)
      const force = 0.1 * dist
      bit.xVel = force * Math.cos(angle)
      bit.yVel = force * Math.sin(angle)
      pos.x = bit.x
      pos.y = bit.y
      bit.x += bit.xVel
      bit.y += bit.yVel
    }
  }
}

function getMouseXYFromEvent (e) {
  const x = event.offsetX * canvas.width / canvas.offsetWidth / scale
  const y = event.offsetY * canvas.height / canvas.offsetHeight / scale
  return { x, y }
}

function spawnShot (ent) {
  if (!ent.fireMode) {
    const shot = {
      pos: { x: ent.pos.x, y: ent.pos.y },
      vel: { x: 0, y: 0 }
    }

    const angle = getAngle(ent.pos, mousePos)
    const force = 8
    shot.vel.x = force * Math.cos(angle)
    shot.vel.y = force * Math.sin(angle)
    shot.hurtsPlayer = false
    shot.age = 0
    shots.push(shot)
  }
  if (ent.fireMode === 'star') {
    let points = 5
    const offset = (ent.fireSequence / 16) * Math.PI * 2 / points
    for (let i = 0; i < 5; i++) {
      const shot = {
        pos: { x: ent.pos.x, y: ent.pos.y },
        vel: { x: 0, y: 0 }
      }
      const angle = Math.PI * 2 / points * i + offset
      const force = 1
      shot.vel.x = Math.cos(angle) * force
      shot.vel.y = Math.sin(angle) * force
      shot.hurtsPlayer = true
      shot.age = 0
      shots.push(shot)
    }
    ent.fireSequence = (ent.fireSequence + 1) % 16
  }
}

function getDist (pos1, pos2) {
  const xDist = pos1.x - pos2.x
  const yDist = pos1.y - pos2.y
  const dist = Math.sqrt(xDist * xDist + yDist * yDist)
  return dist
}

function getAngle (pos1, pos2) {
  return Math.atan2(pos2.y - pos1.y, pos2.x - pos1.x)
}

export const game = {
  start: start
}

/**
 * Returns true if you should preventDefault
 * @param {*} key 
 * @param {*} state 
 */
function switchKey (key, state) {
  switch (key) {
    case 'ArrowLeft':
    case 'a':
      keys.left = state
      break
    case 'ArrowRight':
    case 'd':
      keys.right = state
      break
    case 'ArrowUp':
    case 'w':
      keys.up = state
      break
    case 'ArrowDown':
    case 's':
      keys.down = state
      break
    case 'q':
      keys.cheat = state
      break
    case ' ':
    case 'x':
    case '/':
    case 'mouse':
      if (!keys.shoot && state === true) keys.shootHit = true
      keys.shoot = state
      break
    case 'l':
      // hack for cheatmode
      if (state === false && keys.cheat) {
        player.cheatMode = !player.cheatMode
      }
      break
    default:
      return false
  }
  return true
}

window.addEventListener('keydown', function (e) {
  const preventDefault = switchKey(e.key, true)
  if (preventDefault) e.preventDefault()
  if (!audioInitialized) {
    playSound('silence') // Unblocks the audio API. This is silly! Why did you do this, Chrome et al?
    audioInitialized = true
  }
})

window.addEventListener('keyup', function (e) {
  switchKey(e.key, false)
})

window.addEventListener('mousedown', function (e) {
  switchKey('mouse', true)
})

window.addEventListener('mouseup', function (e) {
  switchKey('mouse', false)
})

function getIndexFromPixels (x, y) {
  if (x < 0 || y < 0 || x >= world.width * tileSize || y >= world.height * tileSize) return -1
  return Math.floor((y / tileSize)) * world.width + Math.floor((x / tileSize))
}

function getPixelsFromIndex (i) {
  return { x: (i % world.width) * tileSize, y: Math.floor(i / world.width) * tileSize }
}

function isGrounded (ent) {
  return !!getCollidingTiles({ x: ent.pos.x, y: ent.pos.y + 0.1 })
}

function getCollidingTiles (pos) {
  const { x, y } = pos
  const halfTile = tileSize / 2
  const tilesToCheck = [
    [ -halfTile, -halfTile, 'topLeft' ],
    [ halfTile - 0.001, -halfTile, 'topRight' ],
    [ -halfTile, halfTile - 0.001, 'bottomLeft' ],
    [ halfTile - 0.001, halfTile - 0.001, 'bottomRight' ]
  ]
  for (const [xOffset, yOffset] of tilesToCheck) {
    const tileX = Math.floor(x + xOffset)
    const tileY = Math.floor(y + yOffset)
    const tileIndex = getIndexFromPixels(tileX, tileY)
    const tile = world.map[tileIndex]
    if (tile > 0 && hiddenSprites.indexOf(tile) === -1) {
      return { x: tileX, y: tileY }
    }
  }
  return null
}

function restart () {
  frame = 0
  shots.length = 0
  ents.length = 0
  player = new Player(5 * tileSize, 5 * tileSize)
  player.keys = keys
  checkpoints.length = 0

  const level = world.map
  let cId = 0

  checkpoints.push({ id: cId++, x: 2.5, y: 2.5 })

  for (let tY = 0; tY < world.height; tY++) {
    for (let tX = 0; tX < world.height; tX++) {
      const i = tX + tY * world.width
      const x = (i % world.width) + 0.5
      const y = Math.floor(i / world.width) + 0.5
      const sprite = level[i]
    }
  }
  console.log(checkpoints)
}

restart()

function cardSetup () {
  const tileSizePx = tileSize * scale
  ctx.fillStyle = '#140C1C'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  const pos = { x: tileSizePx * 1.5, y: tileSizePx * 1.5, charLimit: state.titleCardCharacter, char: 0 }
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  return pos
}

function printCardTip (text) {
  const tileSizePx = tileSize * scale
  ctx.textAlign = 'right'
  ctx.textBaseline = 'bottom'
  printLine({ x: canvas.width - tileSizePx, y: canvas.height - tileSizePx * 1.5, char: 0, charLimit: 9999 }, text, 'child')
}

function drawIntroCard () {
  const pos = cardSetup()
  printLine(pos, `September`)
  const hint = (pos.char > pos.charLimit) ? 'Press space bar to skip' : 'Press space bar'
  state.active = (pos.char > pos.charLimit)
  printCardTip(hint)
  // Draw player ship
  drawSprite(5, canvas.width * 1 / 3, canvas.height * 3 / 4, false, true)
  drawCardBorder()
}

function drawCardBorder () {
  const tileSizePx = tileSize * scale
  for (let x = 0; x < canvas.width / tileSizePx; x++) {
    drawSprite(23, (x + 0.5) * tileSizePx, tileSizePx / 2, false, true)
    drawSprite(23, (x + 0.5) * tileSizePx, canvas.height - tileSizePx / 2, false, true)
  }
}

function printLine (pos, text, speaker) {
  if (text) {
    if (text.includes('\n')) {
      text.split('\n').forEach(t => printLine(pos, t, speaker))
      return
    }
    ctx.fillStyle = (speaker === 'child') ? '#deeed6' : '#dad45e'
    ctx.fillText(text.substr(0, pos.charLimit - pos.char), pos.x, pos.y)
    pos.char += text.length
    pos.y += lineHeight
  } else {
    pos.char += blankLineCharDelay
    pos.y += lineHeight
    if (state.page === 'endCard') {
      // Hack to make the end page fit: blank lines are narrower
      pos.y -= 2
    }
  }
}

window.addEventListener('mousemove', function (e) {
  mousePos = getMouseXYFromEvent(e)
  mousePos.x += camera.pos.x - canvas.width / 2 / scale
  mousePos.y += camera.pos.y - canvas.height / 2 / scale
})
