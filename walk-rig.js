// Walk-rig core: dot field + skeleton + threshold. Exposes window.WalkRig.
// From the "Walking Guy Rig" artifact; the homepage hero draws it.
(function (root) {
  const ORIG = [[266,160],[264,171],[254,177],[240,181],[247,191],[259,201],[265,211],[270,224],[277,236],[286,244],[297,238],[296,251],[307,246],[277,213],[284,227],[273,198],[244,204],[232,199],[220,204],[217,193],[203,201],[210,211],[199,215],[207,224],[197,231],[205,238],[196,245],[229,187],[259,189],[253,213],[258,225],[247,226],[237,232],[244,242],[256,239],[254,253],[236,252],[223,252],[224,267],[238,272],[233,287],[220,280],[216,293],[227,302],[220,319],[209,309],[205,322],[213,335],[198,338],[207,350],[247,262],[259,268],[249,284],[266,282],[257,297],[271,299],[261,313],[274,316],[265,332],[279,333],[269,348],[282,351],[241,215],[230,213],[227,226],[225,239],[269,182],[255,164],[257,151],[269,148],[278,157],[276,168]];

  // Seeded PRNG so the generated field is identical on every load.
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Region the walk cycle sweeps through (a soft blob, not a rectangle, so the field edge looks organic).
  const REGION = { cx: 248, cy: 250, rx: 110, ry: 136 };
  function inRegion(x, y) {
    const dx = (x - REGION.cx) / REGION.rx, dy = (y - REGION.cy) / REGION.ry;
    return dx * dx + dy * dy <= 1;
  }

  // Bridson Poisson-disc sampling, seeded with the original dots (which never move),
  // then a few relaxation passes that only push the new dots apart.
  function buildField(opts) {
    const o = Object.assign({ rMin: 11.6, seed: 7, relax: 30, target: 12.4 }, opts);
    const rand = mulberry32(o.seed);
    const cell = o.rMin / Math.SQRT2;
    const grid = new Map();
    const pts = [];
    const key = (x, y) => Math.floor(x / cell) + ',' + Math.floor(y / cell);
    function add(x, y, fixed) {
      const p = { x, y, fixed };
      pts.push(p);
      grid.set(key(x, y), (grid.get(key(x, y)) || []).concat(p));
      return p;
    }
    function farEnough(x, y) {
      const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
        const c = grid.get((gx + i) + ',' + (gy + j));
        if (!c) continue;
        for (const q of c) if ((q.x - x) ** 2 + (q.y - y) ** 2 < o.rMin * o.rMin) return false;
      }
      return true;
    }
    const active = [];
    for (const [x, y] of ORIG) active.push(add(x, y, true));
    while (active.length) {
      const idx = Math.floor(rand() * active.length);
      const p = active[idx];
      let placed = false;
      for (let k = 0; k < 30; k++) {
        const a = rand() * Math.PI * 2, r = o.rMin * (1 + rand() * 0.6);
        const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
        if (inRegion(x, y) && farEnough(x, y)) { active.push(add(x, y, false)); placed = true; break; }
      }
      if (!placed) active.splice(idx, 1);
    }
    // Relax: new dots repel neighbours closer than `target`; originals are pinned.
    for (let it = 0; it < o.relax; it++) {
      for (const p of pts) {
        if (p.fixed) continue;
        let fx = 0, fy = 0;
        for (const q of pts) {
          if (q === p) continue;
          const dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy);
          if (d > 0 && d < o.target) { const f = (o.target - d) / d * 0.25; fx += dx * f; fy += dy * f; }
        }
        const nx = p.x + fx, ny = p.y + fy;
        if (inRegion(nx, ny)) { p.x = nx; p.y = ny; }
      }
    }
    // A filled dot may never sit inside the drawn figure, so the rest pose always matches the drawing.
    const rest = pose(0, REST).bones;
    return pts.filter((p) => p.fixed || !inside(p.x, p.y, rest));
  }

  // ---------- Skeleton ----------
  const D = Math.PI / 180;
  const TAU = Math.PI * 2;

  // Body proportions, fitted so the contact pose lights exactly the drawn dots.
  const BODY = {
    pelvis: [242, 262], hipSpread: 10, thigh: 44.5, shin: 44, shinFollow: 0.97,
    spine: 69, shoulderSpread: 26.5, shoulderY: 2,
    upperArm: 38.5, forearm: 22, headDx: 24, headDy: 34, headR: 15.5,
    rLeg: 11.5, rThigh: 12.5, rArm: 9, rTorso: 19, rHip: 17, rNeck: 10,
  };

  // Animation controls. Angles in degrees, distances in drawing units, delays in fractions of a cycle.
  // DEFAULTS is what plays. REST is the drawn pose: same amplitudes, every delay zero.
  const DEFAULTS = {
    speed: 96,
    stride: 18, strideBias: 5, stanceHold: 0.4, kneeBend: 55, kneeDelay: 0.03, kneeGive: 6, footLock: 1,
    crouch: 0, bounce: 2.5, bounceDelay: 0.04, hipTwist: 1, hipDelay: 0.02, hipDrop: 2,
    lean: 2, leanSway: 2, leanDelay: 0.1, torsoDelay: 0.05,
    shoulderTwist: 1, counter: 1, twistDelay: 0.05, shoulderDrop: 5,
    armSwing: 18, armDouble: 0, armDelay: 0.06, elbowBend: 22, elbowSwing: 22, elbowDelay: 0.1,
    headDrop: 0, headBob: 1.5, headDelay: 0.1,
  };
  const REST = Object.assign({}, DEFAULTS, {
    strideBias: 0, stanceHold: 0, lean: 0, kneeGive: 0, bounce: 0, hipDrop: 0, leanSway: 0, headBob: 0,
    kneeDelay: 0, bounceDelay: 0, hipDelay: 0, leanDelay: 0, torsoDelay: 0, twistDelay: 0, armDelay: 0, elbowDelay: 0, headDelay: 0,
  });

  // Gait presets. The walk is whatever the sliders say; gait blends it toward one of these.
  const SHUFFLE = {
    speed: 68,
    stride: 7, strideBias: 2, stanceHold: 0.6, kneeBend: 12, kneeDelay: 0.05, kneeGive: 9, footLock: 1,
    crouch: 3, bounce: 0.5, bounceDelay: 0.08, hipTwist: 0.6, hipDelay: 0.06, hipDrop: 1.5,
    lean: 4, leanSway: 1, leanDelay: 0.15, torsoDelay: 0.1,
    shoulderTwist: 0.5, counter: -0.7, twistDelay: 0.1, shoulderDrop: 3,
    armSwing: 6, armDouble: 1, armDelay: 0.14, elbowBend: 12, elbowSwing: 8, elbowDelay: 0.16,
    headDrop: 6, headBob: 0.75, headDelay: 0.16,
  };
  const RUN = {
    speed: 168,
    stride: 30, strideBias: 6, stanceHold: -0.45, kneeBend: 88, kneeDelay: -0.06, kneeGive: 14, footLock: 0,
    crouch: 2, bounce: 7, bounceDelay: 0.23, hipTwist: 1.3, hipDelay: 0.02, hipDrop: 3,
    lean: 9, leanSway: 3, leanDelay: 0.08, torsoDelay: 0.03,
    shoulderTwist: 1.2, counter: 1, twistDelay: 0.03, shoulderDrop: 4,
    armSwing: 34, armDouble: 0, armDelay: 0.03, elbowBend: 82, elbowSwing: 12, elbowDelay: 0.05,
    headDrop: 0, headBob: 1.5, headDelay: 0.06,
  };
  // gait in [-1, 1]: -1 shuffle, 0 the walk as given, +1 run.
  const smooth = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  // Walking and running are different mechanisms, so these flip over a short range instead of blending.
  const RUN_SWITCH = ['footLock', 'bounceDelay', 'stanceHold'];
  const RUN_AT = 0.5;
  function blendGait(walk, gait) {
    const target = gait < 0 ? SHUFFLE : RUN, k = Math.min(1, Math.abs(gait));
    const e = smooth(0, 1, k);                            // ease so the middle of the slider stays near the walk
    const snap = gait > 0 ? smooth(RUN_AT - 0.06, RUN_AT + 0.06, k) : e;
    const out = {};
    for (const key in walk) {
      if (!(key in target)) { out[key] = walk[key]; continue; }
      const w = gait > 0 && RUN_SWITCH.includes(key) ? snap : e;
      out[key] = walk[key] + (target[key] - walk[key]) * w;
    }
    return out;
  }

  // Moods push the current gait: values are multipliers (x) and additions (+), scaled by intensity.
  const MOODS = {
    happy:  { x: { speed: 1.15, stride: 1.2, armSwing: 1.45, elbowSwing: 1.2, bounce: 1.9, kneeBend: 1.1, headBob: 1.6, leanSway: 1.3 }, add: { headDrop: -7, lean: -2 } },
    sad:    { x: { speed: 0.72, stride: 0.62, armSwing: 0.35, elbowSwing: 0.5, bounce: 0.4, kneeBend: 0.75, shoulderTwist: 0.6, headBob: 0.5 },
              add: { headDrop: 16, lean: 7, crouch: 2, armDelay: 0.04, headDelay: 0.05 } },
    angry:  { x: { speed: 1.22, stride: 1.25, armSwing: 1.3, bounce: 1.3, kneeGive: 1.8, shoulderDrop: 1.4, shoulderTwist: 1.2 },
              add: { elbowBend: 26, lean: 6, headDrop: 9, armDelay: -0.02, elbowDelay: -0.03 } },
    afraid: { x: { speed: 1.25, stride: 0.6, armSwing: 0.4, elbowSwing: 0.6, bounce: 0.6, shoulderTwist: 0.5, kneeBend: 0.85 },
              add: { elbowBend: 36, crouch: 3, lean: 4, headDrop: 12 } },
  };
  function applyMood(c, mood, k) {
    const m = MOODS[mood];
    if (!m || !k) return c;
    const out = Object.assign({}, c);
    for (const key in m.x) out[key] = c[key] * Math.max(0, 1 + (m.x[key] - 1) * k);
    for (const key in m.add) out[key] = out[key] + m.add[key] * k;
    return out;
  }

  // Slow non-repeating drift (sum of incommensurate sines), so no two cycles match.
  const VARY = { bounce: 0.4, armSwing: 0.3, stride: 0.12, leanSway: 0.5, headBob: 0.5, elbowSwing: 0.3, kneeBend: 0.12 };
  const VARY_DELAY = ['armDelay', 'elbowDelay', 'headDelay', 'bounceDelay', 'twistDelay'];
  function drift(i, time) {
    const a = 0.31 + i * 0.137, b = 0.53 + i * 0.091;
    return 0.6 * Math.sin(time * a + i * 1.7) + 0.4 * Math.sin(time * b + i * 4.1);
  }
  function applyVariation(c, amount, time) {
    if (!amount) return c;
    const out = Object.assign({}, c);
    let i = 0;
    for (const key in VARY) out[key] = c[key] * (1 + VARY[key] * amount * drift(i++, time));
    for (const key of VARY_DELAY) out[key] = c[key] + 0.035 * amount * drift(i++, time);
    return out;
  }

  function rot(len, ang) { return [Math.sin(ang) * len, Math.cos(ang) * len]; } // angle from straight down; + = forward (right)
  // 0 at contact, 1 at passing (twice per cycle), shifted later by `delay`.
  const lift = (t, delay) => (1 - Math.cos(2 * (t - delay * TAU))) / 2;

  // Stretch the stance half of the cycle (foot on the ground) and compress the swing.
  // h > 0 keeps the foot planted longer (walk ~60% stance); h < 0 shortens contact (run).
  function stanceWarp(p, h) {
    if (!h) return p;
    const turns = Math.floor(p / TAU), u = p / TAU - turns;
    return (turns + u + h * (Math.cos(TAU * u) - 1) / TAU) * TAU;
  }
  function legAngles(t, off, c) {
    const p = stanceWarp(t + off, c.stanceHold);
    const s = Math.cos(p);                                   // +1 fully forward, -1 fully back
    const th = (c.stride * s + c.strideBias) * D;
    const swing = Math.max(0, -Math.sin(p - c.kneeDelay * TAU)); // leg travelling back -> front
    const stance = Math.max(0, Math.sin(p));                 // weight on this leg
    const sh = th * BODY.shinFollow - c.kneeBend * D * Math.pow(swing, 1.4) - c.kneeGive * D * stance * stance;
    return { p, s, th, sh, swing };
  }
  const legHeight = (l) => BODY.thigh * Math.cos(l.th) + BODY.shin * Math.cos(l.sh);
  const restLegH = legHeight(legAngles(0, 0, REST));
  const groundY = BODY.pelvis[1] + restLegH;

  function pelvisAt(t, c) {
    const h = Math.max(legHeight(legAngles(t, 0, c)), legHeight(legAngles(t, Math.PI, c)));
    const locked = groundY - h, free = BODY.pelvis[1];
    return [BODY.pelvis[0], free + (locked - free) * c.footLock + c.crouch - c.bounce * lift(t, c.bounceDelay)];
  }
  function chestAt(t, c) {
    const pel = pelvisAt(t - c.torsoDelay * TAU, c);
    const lean = (c.lean + c.leanSway * lift(t, c.leanDelay)) * D;
    return [pel[0] + Math.sin(lean) * BODY.spine, pel[1] - Math.cos(lean) * BODY.spine];
  }

  // phase in [0, 1). Phase 0 with REST controls is the drawn pose.
  function pose(phase, controls) {
    const c = Object.assign({}, DEFAULTS, controls);
    const t = phase * TAU;
    const pel = pelvisAt(t, c);
    const bones = []; // [x1,y1,x2,y2,r1,r2]
    const out = { pel, legs: [], arms: [] };

    for (const off of [0, Math.PI]) {
      const l = legAngles(t, off, c);
      const ht = Math.cos(l.p - c.hipDelay * TAU);
      const hip = [pel[0] + BODY.hipSpread * c.hipTwist * ht, pel[1] + c.hipDrop * l.swing];
      const kv = rot(BODY.thigh, l.th), knee = [hip[0] + kv[0], hip[1] + kv[1]];
      const av = rot(BODY.shin, l.sh), ankle = [knee[0] + av[0], knee[1] + av[1]];
      bones.push([hip[0], hip[1], knee[0], knee[1], BODY.rThigh, BODY.rLeg]);
      bones.push([knee[0], knee[1], ankle[0], ankle[1], BODY.rLeg, BODY.rLeg]);
      out.legs.push([hip, knee, ankle]);
    }

    const chest = chestAt(t, c);
    bones.push([pel[0] - 3, pel[1] - 6, chest[0], chest[1] + 16, BODY.rHip, BODY.rTorso]);

    // arm i swings opposite leg i, trailing it by armDelay; the forearm trails the upper arm by elbowDelay.
    for (const off of [0, Math.PI]) {
      const p = t + off;
      const tw = -Math.cos(p - c.twistDelay * TAU) * c.counter;
      const sh = [chest[0] + BODY.shoulderSpread * c.shoulderTwist * tw, chest[1] + BODY.shoulderY + c.shoulderDrop * tw];
      // 1:1 arms swing opposite their leg; at 2:1 (slow walking) both arms swing together at step rate.
      const ap = p - c.armDelay * TAU;
      const ua = c.armSwing * D * ((1 - c.armDouble) * -Math.cos(ap) + c.armDouble * -Math.cos(2 * ap));
      const ev = rot(BODY.upperArm, ua), elbow = [sh[0] + ev[0], sh[1] + ev[1]];
      const fp = p - (c.armDelay + c.elbowDelay) * TAU;
      const fa = ua + c.elbowBend * D + c.elbowSwing * D * ((1 - c.armDouble) * -Math.cos(fp) + c.armDouble * -Math.cos(2 * fp));
      const hv = rot(BODY.forearm, fa), hand = [elbow[0] + hv[0], elbow[1] + hv[1]];
      bones.push([sh[0], sh[1], elbow[0], elbow[1], BODY.rArm, BODY.rArm]);
      bones.push([elbow[0], elbow[1], hand[0], hand[1], BODY.rArm, BODY.rArm]);
      out.arms.push([sh, elbow, hand]);
    }
    bones.push([out.arms[0][0][0], out.arms[0][0][1], out.arms[1][0][0], out.arms[1][0][1], BODY.rNeck, BODY.rNeck]); // shoulder yoke

    // head rides the chest's path a little late, plus its own bob
    const hc = chestAt(t - c.headDelay * TAU, c);
    // head drop pivots the head forward and down around the base of the neck
    const nb = [hc[0] + 6, hc[1] + 2], ox = BODY.headDx - 6, oy = -BODY.headDy - 2, hd = c.headDrop * D;
    const head = [nb[0] + ox * Math.cos(hd) - oy * Math.sin(hd),
                  nb[1] + ox * Math.sin(hd) + oy * Math.cos(hd) - c.headBob * lift(t, c.headDelay)];
    // neck: two tapered strands from the top of the chest to the head, so it follows lean and head drop
    bones.push([chest[0] + 2, chest[1] - 2, head[0] - 2, head[1] + 4, 14, 10]);
    bones.push([chest[0] + 16, chest[1] + 2, head[0] + 4, head[1] + 8, 12, 10]);
    bones.push([head[0], head[1], head[0], head[1], BODY.headR, BODY.headR]);
    out.chest = chest; out.head = head; out.bones = bones;
    return out;
  }

  // Signed distance to a tapered capsule (radius r1 at a, r2 at b). < 0 means inside.
  function capsule(px, py, b) {
    const [ax, ay, bx, by, r1, r2] = b;
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + dx * t, cy = ay + dy * t;
    return Math.hypot(px - cx, py - cy) - (r1 + (r2 - r1) * t);
  }
  function inside(px, py, bones) {
    for (const b of bones) if (capsule(px, py, b) < 0) return true;
    return false;
  }

  root.WalkRig = { ORIG, buildField, pose, inside, capsule, DEFAULTS, REST, BODY, SHUFFLE, RUN, blendGait, MOODS, applyMood, applyVariation, RUN_AT };
})(typeof window !== 'undefined' ? window : globalThis);
