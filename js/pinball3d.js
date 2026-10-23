// 星际远航的 3D 画面 (three.js): 照着台面 (pinball.js) 搭出来, 每帧照着一局的样子摆好挡板、球、灯。
//   坐标: 台面的 (x, y, z) → 3D 的 X = (x - 300) / 100 (往右), Y = z / 100 (往上), Z = (y - 500) / 100 (往玩的人这边)
//   东西: 台面贴图 (pinart.js 画的, 有一层清漆反光)、镀铬的墙和导轨、塑料的弹弓、石头小行星、透明的曲速坡道、
//         黑洞 (吸积盘在转) 和上面飘着的飞碟、顶上三个虫洞、带环的行星、弹簧; 灯亮了会发光 (bloom)
//   镜头: 横着的屏幕跟着球上下走; 竖着的屏幕从上面看整张台

import { W, H, BALL_R, LANE_X, CHAPTERS, WARP_MAX } from './pinball.js';
import { paintPlayfield, INSERTS, insertPath, AIM, COLORS } from './pinart.js';

const S = 0.01;
const X = (x) => (x - W / 2) * S;
const mx = (x) => 560 - x; // 左右对称 (跟 pinball.js 一样)
const Z = (y) => (y - H / 2) * S;

export function createScene(THREE, canvas, table, { quality = 'high' } = {}) {
  const low = quality === 'low';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !low, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x02040b);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.28;
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);

  // ---- 灯光 ----
  scene.add(new THREE.HemisphereLight(0xa8c4ff, 0x0a1020, 0.38));
  const key = new THREE.DirectionalLight(0xf2f6ff, 1.5);
  key.position.set(1.8, 9, 5);
  key.target.position.set(0, 0, -0.5);
  key.castShadow = true;
  key.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048);
  Object.assign(key.shadow.camera, { left: -3.6, right: 3.6, top: 6, bottom: -6, near: 1, far: 20 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 3;
  scene.add(key, key.target);
  const pink = new THREE.PointLight(0x3a6dff, 2.2, 7, 1.6); // 左上: 深一点的蓝
  pink.position.set(-2.2, 1.6, -3);
  const cyan = new THREE.PointLight(0x9fd4ff, 2.6, 7, 1.6); // 右下: 浅的冰蓝
  cyan.position.set(2.3, 1.4, 1.2);
  scene.add(pink, cyan);

  // ---- 材料 ----
  const M = {
    chrome: new THREE.MeshStandardMaterial({ color: 0xc4ccdc, metalness: 1, roughness: 0.2 }),
    darkMetal: new THREE.MeshStandardMaterial({ color: 0x1c2040, metalness: 0.7, roughness: 0.35 }),
    cabinet: new THREE.MeshStandardMaterial({ color: 0x0c1222, metalness: 0.4, roughness: 0.5 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0xcfcfd6, roughness: 0.6 }),
    rubberRed: new THREE.MeshStandardMaterial({ color: 0x23262f, roughness: 0.55 }), // (挡板的橡皮: 黑的)
    flipper: new THREE.MeshPhysicalMaterial({ color: 0xd8dae4, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.15 }),
    slingPlastic: new THREE.MeshPhysicalMaterial({ color: 0x24448a, roughness: 0.15, transparent: true, opacity: 0.85, clearcoat: 1, emissive: 0x4a8aff, emissiveIntensity: 0.15 }),
    rampPlastic: new THREE.MeshPhysicalMaterial({ color: 0xb4dcff, roughness: 0.08, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false, clearcoat: 1 }),
    throat: new THREE.MeshPhysicalMaterial({ color: 0xb4dcff, roughness: 0.1, transparent: true, opacity: 0.55, clearcoat: 1 }),
    ball: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.08, envMapIntensity: 3.2 }),
    rock: new THREE.MeshStandardMaterial({ color: 0x8c7b6b, roughness: 0.95, metalness: 0.05, flatShading: true }),
    drop: new THREE.MeshPhysicalMaterial({ color: 0xdfe8f5, roughness: 0.3, clearcoat: 1, emissive: 0x7fd0ff, emissiveIntensity: 0.1 }),
    target: new THREE.MeshPhysicalMaterial({ color: 0xffb44d, roughness: 0.3, clearcoat: 1, emissive: 0xff9a20, emissiveIntensity: 0.1 }),
    led: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7fd0ff).multiplyScalar(2), toneMapped: false }),
    ledPink: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7fd0ff).multiplyScalar(2), toneMapped: false }),
  };

  const meshes = []; // 都放这, 关的时候一起扔掉
  const add = (obj, parent = scene) => {
    parent.add(obj);
    meshes.push(obj);
    return obj;
  };
  const shadow = (m, cast = true, receive = true) => {
    m.castShadow = cast;
    m.receiveShadow = receive;
    return m;
  };

  // ---- 台面 ----
  const art = document.createElement('canvas');
  const k = low ? 1.6 : 3.2; // 贴图一个台面单位几个像素
  art.width = Math.round(W * k);
  art.height = Math.round(H * k);
  const actx = art.getContext('2d');
  actx.setTransform(k, 0, 0, k, 0, 0);
  paintPlayfield(actx, table);
  const artTex = new THREE.CanvasTexture(art);
  artTex.colorSpace = THREE.SRGBColorSpace;
  artTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  // (省电的画法不要清漆那一层: 整个屏幕每个像素都要多算一遍)
  const floorMat = low ? new THREE.MeshStandardMaterial({ map: artTex, roughness: 0.35, metalness: 0 }) : new THREE.MeshPhysicalMaterial({ map: artTex, roughness: 0.4, metalness: 0, clearcoat: 0.9, clearcoatRoughness: 0.1 });
  const floor = add(new THREE.Mesh(new THREE.PlaneGeometry(W * S, H * S), floorMat));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;

  // ---- 墙: 每段一个长方体 (同一种材料的合成一个, 画得快) ----
  const parts = new Map(); // 材料 → [几何体]
  const put = (geo, mat) => {
    if (!parts.has(mat)) parts.set(mat, []);
    parts.get(mat).push(geo);
  };
  const box = (ax, ay, bx, by, { h = 0.3, t = 0.06, y0 = 0, mat = M.chrome } = {}) => {
    const dx = X(bx) - X(ax);
    const dz = Z(by) - Z(ay);
    const len = Math.hypot(dx, dz);
    const g = new THREE.BoxGeometry(len + t, h, t);
    g.rotateY(-Math.atan2(dz, dx));
    g.translate((X(ax) + X(bx)) / 2, y0 + h / 2, (Z(ay) + Z(by)) / 2);
    put(g, mat);
  };
  const post = (x, y, { r = 0.04, h = 0.3, y0 = 0, mat = M.chrome } = {}) => {
    const g = new THREE.CylinderGeometry(r, r, h, 16);
    g.translate(X(x), y0 + h / 2, Z(y));
    put(g, mat);
  };
  const tube = (pts, { r = 0.018, mat = M.chrome, closed = false } = {}) => {
    const curve = new THREE.CatmullRomCurve3(pts, closed, 'catmullrom', 0.05);
    put(new THREE.TubeGeometry(curve, Math.max(8, pts.length * 6), r, 8, closed), mat);
  };
  const path = (pts) => pts.slice(1).map((p, i) => [pts[i], p]);
  // 外圈: 顶上的圆弧 + 左右的墙 (深色的墙, 上面一条镀铬)
  //   (墙有 16 点厚, 往外挪半个墙, 球碰到的是墙的里面)
  const outer = [];
  for (let i = 0; i <= 40; i++) {
    const a = Math.PI + (Math.PI * i) / 40;
    outer.push([300 + Math.cos(a) * 288, 300 + Math.sin(a) * 288]);
  }
  const outline = [[12, 1040], [12, 300], ...outer.slice(1, -1), [588, 300], [588, 1040]];
  for (const [[ax, ay], [bx, by]] of path(outline)) box(ax, ay, bx, by, { h: 0.5, t: 0.16, mat: M.cabinet });
  tube(outline.map(([x, y]) => new THREE.Vector3(X(x), 0.52, Z(y))), { r: 0.035 });
  // 发射通道的墙
  box(LANE_X, 1040, LANE_X, 432, { h: 0.32, t: 0.05 });
  // 导轨: 两根镀铬的线
  for (const pts of table.rails.guides) {
    for (const hgt of [0.07, 0.2]) tube(pts.map(([x, y]) => new THREE.Vector3(X(x), hgt, Z(y))), { r: 0.02 });
    for (const [x, y] of pts) post(x, y, { r: 0.025, h: 0.24 });
  }
  for (const pts of table.rails.bulges) for (const [[ax, ay], [bx, by]] of path(pts)) box(ax, ay, bx, by, { h: 0.26, t: 0.05 });
  for (const [[ax, ay], [bx, by]] of table.rails.dividers) {
    box(ax, ay, bx, by, { h: 0.2, t: 0.05 });
    post(ax, ay, { r: 0.045, h: 0.26, mat: M.rubberRed });
  }
  // 坡道入口的两边 (透明塑料)
  for (const [[ax, ay], [bx, by]] of table.rails.ramp) box(ax, ay, bx, by, { h: 0.3, t: 0.04, mat: M.throat });
  for (const [[ax, ay], [bx, by]] of path(table.rails.roof)) box(ax, ay, bx, by, { h: 0.3, t: 0.05 });
  // 单向门
  for (const g of table.gates) box(g.ax, g.ay, g.bx, g.by, { h: 0.12, t: 0.02, y0: 0.06, mat: M.darkMetal });
  // 橡皮柱
  for (const p of table.posts) {
    post(p.x, p.y, { r: 0.022, h: 0.3 });
    const ring = new THREE.TorusGeometry(p.r * S - 0.02, 0.02, 10, 20);
    ring.rotateX(Math.PI / 2);
    ring.translate(X(p.x), 0.12, Z(p.y));
    put(ring, M.rubber);
  }
  // 弹弓: 塑料三角 + 一圈白橡皮
  const slingMeshes = table.slingShapes.map((tri) => {
    const shape = new THREE.Shape(tri.map(([x, y]) => new THREE.Vector2(X(x), -Z(y))));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0.06, 0);
    const m = add(shadow(new THREE.Mesh(geo, M.slingPlastic.clone())));
    const loop = [...tri, tri[0]].map(([x, y]) => new THREE.Vector3(X(x), 0.1, Z(y)));
    tube(loop, { r: 0.03, mat: M.rubber });
    return m;
  });
  // 合起来
  for (const [mat, geos] of parts) add(shadow(new THREE.Mesh(THREE.mergeGeometries(geos), mat)));

  // 机柜两边的灯条、下面的挡板 (球从下面掉下去就看不见了)
  for (const x of [2, 598]) {
    const strip = add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 9), x < 300 ? M.led : M.ledPink));
    strip.position.set(X(x), 0.55, 0.3);
  }
  const apronTex = (() => {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 128;
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, 128);
    bg.addColorStop(0, '#13203f');
    bg.addColorStop(1, '#060a16');
    g.fillStyle = bg;
    g.fillRect(0, 0, 1024, 128);
    g.font = '900 40px "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = '#7fd0ff';
    g.shadowBlur = 18;
    g.fillStyle = '#e8f2ff';
    g.fillText('星 际 远 航', 512, 60);
    g.shadowBlur = 0;
    g.font = '800 22px "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
    g.fillStyle = '#9fd4ff';
    g.fillText('护 盾', 248, 34);
    g.fillStyle = '#9fd4ff';
    g.fillText('任 务 · 危 机', 776, 34);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const apron = add(shadow(new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.12, 0.6), [M.cabinet, M.cabinet, new THREE.MeshStandardMaterial({ map: apronTex, roughness: 0.4, metalness: 0.2 }), M.cabinet, M.cabinet, M.cabinet]), false, true));
  apron.position.set(X(280), 0.06, Z(1028));

  // ---- 小行星 (蘑菇头): 石头 + 底下一圈会闪的光 ----
  const bumpers = table.bumpers.map((b, i) => {
    const g = new THREE.Group();
    g.position.set(X(b.x), 0, Z(b.y));
    const base = new THREE.Mesh(new THREE.CylinderGeometry(b.r * S, b.r * S + 0.01, 0.05, 32), M.darkMetal);
    base.position.y = 0.025;
    const color = [0x7fd0ff, 0xa8e0ff, 0x6ab0ff][i];
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), toneMapped: false, transparent: true, opacity: 0.9 });
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(b.r * S + 0.01, b.r * S + 0.01, 0.1, 32, 1, true), ringMat);
    ring.position.y = 0.11;
    const rock = new THREE.IcosahedronGeometry(b.r * S * 0.82, 3);
    const pos = rock.attributes.position;
    const v = new THREE.Vector3();
    for (let j = 0; j < pos.count; j++) {
      v.fromBufferAttribute(pos, j);
      const n = 1 + 0.12 * Math.sin(v.x * 37 + i) * Math.sin(v.y * 41) * Math.sin(v.z * 29 + i * 2) + 0.06 * Math.sin(v.x * 90 + v.z * 70);
      v.multiplyScalar(n);
      pos.setXYZ(j, v.x, v.y * 0.75, v.z);
    }
    rock.computeVertexNormals();
    const stone = new THREE.Mesh(rock, M.rock);
    stone.position.y = 0.3;
    g.add(shadow(base, false), ring, shadow(stone));
    add(g);
    return { g, stone, ring, ringMat, color: new THREE.Color(color) };
  });

  // ---- 挡板 ----
  const flipperShape = (f, grow = 0) => {
    const s = new THREE.Shape();
    const r0 = f.r0 * S + grow;
    const r1 = f.r1 * S + grow;
    const len = f.len * S;
    const a = Math.asin((r0 - r1) / len);
    s.absarc(0, 0, r0, Math.PI / 2 - a, (Math.PI * 3) / 2 + a, false);
    s.absarc(len, 0, r1, -Math.PI / 2 + a, Math.PI / 2 - a, false);
    s.closePath();
    return s;
  };
  const flippers = table.flippers.map((f) => {
    const g = new THREE.Group();
    g.position.set(X(f.px), 0, Z(f.py));
    const body = new THREE.ExtrudeGeometry(flipperShape(f), { depth: 0.16, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.015, bevelSegments: 3 });
    body.rotateX(-Math.PI / 2);
    body.translate(0, 0.05, 0);
    const rubber = new THREE.ExtrudeGeometry(flipperShape(f, 0.022), { depth: 0.07, bevelEnabled: false });
    rubber.rotateX(-Math.PI / 2);
    rubber.translate(0, 0.07, 0);
    const pin = new THREE.CylinderGeometry(0.035, 0.035, 0.26, 16);
    pin.translate(0, 0.13, 0);
    g.add(shadow(new THREE.Mesh(body, M.flipper)), shadow(new THREE.Mesh(rubber, M.rubberRed)), new THREE.Mesh(pin, M.chrome));
    add(g);
    return g;
  });

  // ---- 掉落靶 (星座)、任务靶、推进器 ----
  const drops = table.drops.map((d) => {
    const m = add(shadow(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, (d.by - d.ay) * S), M.drop.clone())));
    m.position.set(X(d.ax - 2.5), 0.11, Z((d.ay + d.by) / 2));
    return m;
  });
  const targets = table.targets.map((tg) => {
    const len = Math.hypot(tg.bx - tg.ax, tg.by - tg.ay) * S;
    const m = add(shadow(new THREE.Mesh(new THREE.BoxGeometry(len, 0.2, 0.04), M.target.clone())));
    m.position.set(X((tg.ax + tg.bx) / 2), 0.12, Z((tg.ay + tg.by) / 2));
    m.rotation.y = -Math.atan2(Z(tg.by) - Z(tg.ay), X(tg.bx) - X(tg.ax));
    return m;
  });
  const sp = table.spinner;
  const spinner = new THREE.Group();
  spinner.position.set(X((sp.ax + sp.bx) / 2), 0.2, Z(sp.y));
  const plate = new THREE.Mesh(new THREE.BoxGeometry((sp.bx - sp.ax) * S * 0.85, 0.16, 0.012), new THREE.MeshStandardMaterial({ color: 0xc8d2e4, metalness: 0.9, roughness: 0.25 }));
  spinner.add(shadow(plate));
  add(spinner);
  for (const x of [sp.ax + 3, sp.bx - 3]) post(x, sp.y, { r: 0.012, h: 0.28 });

  // ---- 曲速坡道: 透明的槽 + 两边镀铬的边 + 几根支柱 ----
  {
    const pts = table.ramps[0].path.pts;
    const pos = [];
    const idx = [];
    const wid = 0.17;
    const wall = 0.12;
    const sides = pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      const tx = X(b[0]) - X(a[0]);
      const tz = Z(b[1]) - Z(a[1]);
      const l = Math.hypot(tx, tz) || 1;
      const nx = -tz / l;
      const nz = tx / l;
      const y = p[2] * S + 0.01;
      const c = [X(p[0]), y, Z(p[1])];
      return { c, l: [c[0] + nx * wid, y, c[2] + nz * wid], r: [c[0] - nx * wid, y, c[2] - nz * wid] };
    });
    sides.forEach(({ l, r }) => pos.push(...l, ...r, l[0], l[1] + wall, l[2], r[0], r[1] + wall, r[2]));
    for (let i = 0; i < sides.length - 1; i++) {
      const a = i * 4;
      const b = a + 4;
      idx.push(a, b, a + 1, a + 1, b, b + 1); // 底
      idx.push(a, a + 2, b, b, a + 2, b + 2); // 左边
      idx.push(a + 1, b + 1, a + 3, a + 3, b + 1, b + 3); // 右边
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    add(new THREE.Mesh(geo, M.rampPlastic));
    const edge = (key) => new THREE.CatmullRomCurve3(sides.filter((_, i) => i % 3 === 0 || i === sides.length - 1).map((s) => new THREE.Vector3(s[key][0], s[key][1] + wall, s[key][2])));
    for (const key of ['l', 'r']) add(shadow(new THREE.Mesh(new THREE.TubeGeometry(edge(key), 160, 0.016, 8), M.chrome), true, false));
    sides.forEach((s, i) => {
      if (i % 26 !== 13 || s.c[1] < 0.2) return;
      const pole = add(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, s.c[1], 8), M.chrome));
      pole.position.set(s.c[0], s.c[1] / 2, s.c[2]);
    });
  }

  // ---- 对接坡道: 金色的铁丝坡道 (下面两根托着球, 两边各一根拦着), 一圈一圈的箍, 几根柱子 ----
  {
    const gold = new THREE.MeshStandardMaterial({ color: 0xc8d0de, metalness: 1, roughness: 0.2 }); // (铁丝: 镀铬的)
    const pts = table.ramps[1].path.pts.map((p) => new THREE.Vector3(X(p[0]), p[2] * S + BALL_R * S, Z(p[1])));
    const up = new THREE.Vector3(0, 1, 0);
    const frames = pts.map((c, i) => {
      const t = pts[Math.min(pts.length - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize();
      const n = new THREE.Vector3().crossVectors(t, up).normalize();
      const u = new THREE.Vector3().crossVectors(n, t).normalize();
      return { c, t, n, u };
    });
    const wire = (dn, du) => frames.filter((_, i) => i % 2 === 0 || i === frames.length - 1).map(({ c, n, u }) => c.clone().addScaledVector(n, dn).addScaledVector(u, du));
    const wires = [
      [0.07, -0.095],
      [-0.07, -0.095],
      [0.135, 0.01],
      [-0.135, 0.01],
    ];
    const geos = wires.map(([dn, du]) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wire(dn, du)), 220, 0.011, 6));
    frames.forEach(({ c, t }, i) => {
      if (i % 14 !== 7) return;
      const hoop = new THREE.TorusGeometry(0.15, 0.009, 6, 20, Math.PI * 1.25);
      hoop.rotateZ(-Math.PI * 0.125 - Math.PI / 2 - Math.PI * 0.5);
      hoop.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), t));
      hoop.translate(c.x, c.y, c.z);
      geos.push(hoop);
      if (c.y > 0.35 && i % 28 === 7) {
        const pole = new THREE.CylinderGeometry(0.013, 0.013, c.y - 0.12, 8);
        pole.translate(c.x, (c.y - 0.12) / 2, c.z);
        geos.push(pole);
      }
    });
    add(shadow(new THREE.Mesh(THREE.mergeGeometries(geos), gold), true, false));
  }

  // 对接坡道口: 一座门架 (两根柱子、横梁上写着「对接舱」、两排灯), 打上去的时候两只夹子合一下
  const gantry = new THREE.Group();
  const gantryLights = [];
  {
    const dock = table.ramps[1];
    const [cx, cy] = [(dock.door[0][0] + dock.door[1][0]) / 2, (dock.door[0][1] + dock.door[1][1]) / 2 + 40];
    gantry.position.set(X(cx), 0, Z(cy));
    const steel = new THREE.MeshStandardMaterial({ color: 0x8a93a8, metalness: 0.85, roughness: 0.35 });
    for (const k of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.62, 0.07), steel);
      pillar.position.set(k * 0.47, 0.31, 0);
      gantry.add(shadow(pillar));
    }
    const sign = (() => {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 48;
      const g = c.getContext('2d');
      g.fillStyle = '#141a33';
      g.fillRect(0, 0, 256, 48);
      g.fillStyle = '#7fd0ff';
      g.fillRect(0, 0, 256, 3);
      g.fillRect(0, 45, 256, 3);
      g.font = '900 28px "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#e8f2ff';
      g.fillText('对 接 舱', 128, 25);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.12, 0.08), [steel, steel, steel, steel, new THREE.MeshStandardMaterial({ map: sign, emissive: 0xffffff, emissiveMap: sign, emissiveIntensity: 0.5 }), steel]);
    beam.position.set(0, 0.66, 0);
    gantry.add(shadow(beam));
    for (let i = 0; i < 6; i++) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), glowMat(0x7fd0ff, 2));
      l.position.set(-0.4 + i * 0.16, 0.59, 0.045);
      gantry.add(l);
      gantryLights.push(l);
    }
    gantry.userData.clamps = [-1, 1].map((k) => {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.05), steel);
      arm.position.set(k * 0.36, 0.5, 0);
      gantry.add(arm);
      return arm;
    });
  }
  add(gantry);

  // ---- 塑料片: 真弹珠台上架在柱子上、印着图的彩色塑料 (弹弓上、导轨上、星座靶上面) ----
  function plasticArt(w, h, color, text) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = Math.max(64, Math.round((256 * h) / w));
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, c.width, c.height);
    bg.addColorStop(0, color);
    bg.addColorStop(1, '#140a36');
    g.fillStyle = bg;
    g.fillRect(0, 0, c.width, c.height);
    // 上边一条亮线、几颗星、字
    g.fillStyle = 'rgba(127,208,255,0.85)';
    g.fillRect(0, 0, c.width, 4);
    g.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 30; i++) g.fillRect(((i * 97) % c.width), 14 + ((i * 53) % (c.height - 16)), 1.5, 1.5);
    if (text) {
      g.save();
      g.translate(c.width / 2, c.height / 2 + 4);
      if (c.height > c.width * 1.4) g.rotate(-Math.PI / 2);
      g.font = `900 ${Math.round(Math.min(c.width, c.height) * 0.22)}px "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.shadowColor = '#fff';
      g.shadowBlur = 8;
      g.fillStyle = '#fff6d8';
      g.fillText(text, 0, 0);
      g.restore();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const plastics = [];
  const plasticPosts = []; // (台面那些柱子已经合成一个了, 这些另外合)
  function plastic(poly, color, text, { y = 0.3, depth = 0.025 } = {}) {
    const xs = poly.map((p) => X(p[0]));
    const zs = poly.map((p) => -Z(p[1]));
    const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(X(p[0]), -Z(p[1]))));
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, y, 0);
    const tex = plasticArt(x1 - x0, z1 - z0, color, text);
    tex.repeat.set(1 / (x1 - x0), 1 / (z1 - z0));
    tex.offset.set(-x0 / (x1 - x0), -z0 / (z1 - z0));
    const mat = new THREE.MeshPhysicalMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35, transparent: true, opacity: 0.88, roughness: 0.2, clearcoat: 1 });
    const m = add(shadow(new THREE.Mesh(geo, mat), true, false));
    plastics.push(m);
    // 撑着的小柱子
    for (const [px, py] of poly.filter((_, i) => i % 2 === 0)) {
      const g = new THREE.CylinderGeometry(0.012, 0.012, y, 8);
      g.translate(X(px), y / 2, Z(py));
      plasticPosts.push(g);
    }
    return m;
  }
  // 弹弓上面: 比弹弓大一圈
  table.slingShapes.forEach((tri, i) => {
    const cx = tri.reduce((n, p) => n + p[0], 0) / 3;
    const cy = tri.reduce((n, p) => n + p[1], 0) / 3;
    plastic(tri.map(([x, y]) => [cx + (x - cx) * 1.12, cy + (y - cy) * 1.12]), '#24448a', i ? '远航' : '护航');
  });
  // 两边回球道的导轨上面
  plastic([[30, 640], [64, 640], [64, 690], [44, 720], [30, 720]], '#1c3670', '');
  plastic([[mx(30), 640], [mx(64), 640], [mx(64), 690], [mx(44), 720], [mx(30), 720]].reverse(), '#1c3670', '');
  // 星座靶上面 (靠墙一条)
  plastic([[20, 424], [44, 424], [44, 600], [20, 600]], '#1c3670', '星座', { y: 0.34 });
  // 顶上通道上面一块弯的
  plastic([[205, 86], [395, 86], [380, 100], [220, 100]], '#1c3670', '', { y: 0.27, depth: 0.02 });
  add(new THREE.Mesh(THREE.mergeGeometries(plasticPosts), M.chrome));

  // ---- 远航号: 飘在台面顶上, 船身、转着的冬眠舱环、太阳能板、发动机的光 ----
  const ark = new THREE.Group();
  {
    const hullMat = new THREE.MeshStandardMaterial({ color: 0xd8deea, metalness: 0.6, roughness: 0.35 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x3a4466, metalness: 0.7, roughness: 0.4 });
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.3, 16), hullMat);
    hull.rotation.z = Math.PI / 2;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.28, 16), hullMat);
    nose.rotation.z = -Math.PI / 2;
    nose.position.x = 0.79;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.035, 10, 40), hullMat);
    ring.rotation.y = Math.PI / 2;
    ring.position.x = -0.25;
    const spokes = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.46, 0.02), dark);
    spokes.position.x = -0.25;
    ring.add(spokes);
    const panels = [-1, 1].map((k) => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.01, 0.16), new THREE.MeshStandardMaterial({ color: 0x2a4a9a, metalness: 0.5, roughness: 0.3, emissive: 0x0a1a50 }));
      p.position.set(0.18, 0, k * 0.17);
      return p;
    });
    const engines = [-0.05, 0.05].map((z) => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), glowMat(0x6ab8ff, 2.4));
      e.position.set(-0.68, 0, z);
      return e;
    });
    ark.add(shadow(hull, true, false), nose, ring, ...panels, ...engines);
    ark.userData.ring = ring;
  }
  ark.position.set(X(300), 1.15, Z(52));
  ark.rotation.y = 0.12;
  ark.scale.setScalar(1.35);
  add(ark);

  // ---- 右上角的雷达: 一根杆子、一个会转的锅 ----
  const radar = new THREE.Group();
  {
    const steel = new THREE.MeshStandardMaterial({ color: 0xb8c0d0, metalness: 0.8, roughness: 0.3 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.5, 10), steel);
    pole.position.y = 0.25;
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 3.2), new THREE.MeshStandardMaterial({ color: 0xe8ecf4, metalness: 0.4, roughness: 0.4, side: THREE.DoubleSide }));
    dish.rotation.x = Math.PI * 0.62;
    dish.position.y = 0.5;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), glowMat(0xe8f2ff, 2.5));
    tip.position.set(0, 0.56, 0.12);
    radar.add(shadow(pole), shadow(dish), tip);
    radar.userData.dish = dish;
    radar.userData.tip = tip;
  }
  radar.position.set(X(596), 0.5, Z(250));
  add(radar);

  // ---- 左下的维修机器人: 站在机柜边上, 眼睛会闪, 打中东西的时候挥手 ----
  const robot = new THREE.Group();
  {
    const body = new THREE.MeshStandardMaterial({ color: 0xd0d6e2, metalness: 0.5, roughness: 0.45 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2b2f3d, metalness: 0.6, roughness: 0.5 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.14), body);
    torso.position.y = 0.26;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.12), body);
    head.position.y = 0.44;
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.025, 0.01), glowMat(0x7fd0ff, 2.4));
    eye.position.set(0, 0.45, 0.065);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.1, 6), dark);
    antenna.position.set(0.04, 0.54, 0);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), glowMat(0x7fd0ff, 2.4));
    bulb.position.set(0.04, 0.6, 0);
    const legs = [-1, 1].map((k) => {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.08), dark);
      l.position.set(k * 0.055, 0.08, 0);
      return l;
    });
    const arms = [-1, 1].map((k) => {
      const a = new THREE.Group();
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.04), dark);
      m.position.y = -0.08;
      a.add(m);
      a.position.set(k * 0.13, 0.34, 0);
      return a;
    });
    robot.add(shadow(torso), shadow(head), eye, antenna, bulb, ...legs, ...arms);
    robot.userData = { eye, bulb, arms };
  }
  robot.position.set(X(-6), 0.5, Z(820));
  robot.rotation.y = 0.5;
  robot.scale.setScalar(1.1);
  add(robot);

  // ---- 黑洞: 转着的吸积盘 + 一圈光, 上面飘着飞碟 ----
  const ho = table.hole;
  const diskTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.translate(128, 128);
    for (let i = 0; i < 900; i++) {
      const t = Math.random();
      const a = t * Math.PI * 8 + Math.random() * 0.4;
      const r = 40 + t * 80;
      g.fillStyle = `hsla(${200 + Math.random() * 25}, 80%, ${70 + Math.random() * 20}%, ${0.5 * (1 - t) + 0.1})`;
      g.beginPath();
      g.arc(Math.cos(a) * r, Math.sin(a) * r, 1 + Math.random() * 2.5, 0, Math.PI * 2);
      g.fill();
    }
    return new THREE.CanvasTexture(c);
  })();
  const diskMat = new THREE.MeshBasicMaterial({ map: diskTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const disk = add(new THREE.Mesh(new THREE.RingGeometry(0.16, 0.52, 48), diskMat));
  disk.rotation.x = -Math.PI / 2;
  disk.position.set(X(ho.x), 0.004, Z(ho.y));
  const rim = add(new THREE.Mesh(new THREE.TorusGeometry(ho.r * S + 0.02, 0.018, 10, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xbfe4ff).multiplyScalar(1.5), toneMapped: false })));
  rim.rotation.x = Math.PI / 2;
  rim.position.set(X(ho.x), 0.01, Z(ho.y));
  const ufo = new THREE.Group();
  {
    const prof = [[0, 0.02], [0.2, 0.03], [0.34, 0.075], [0.37, 0.1], [0.3, 0.125], [0.12, 0.14], [0, 0.145]].map(([r, y]) => new THREE.Vector2(r, y));
    const hull = new THREE.Mesh(new THREE.LatheGeometry(prof, 40), new THREE.MeshStandardMaterial({ color: 0xc8d0e0, metalness: 0.9, roughness: 0.2 }));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0x88f0ff, transparent: true, opacity: 0.55, roughness: 0.05, clearcoat: 1 }));
    dome.position.y = 0.13;
    ufo.add(shadow(hull), dome);
    const lightMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7fd0ff).multiplyScalar(2), toneMapped: false });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), lightMat);
      l.position.set(Math.cos(a) * 0.34, 0.085, Math.sin(a) * 0.34);
      ufo.add(l);
    }
    ufo.userData.lightMat = lightMat;
  }
  ufo.position.set(X(ho.x), 0.75, Z(ho.y));
  ufo.scale.setScalar(0.8);
  add(ufo);
  const beam = add(new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.7, 32, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9fd4ff), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })));
  beam.position.set(X(ho.x), 0.37, Z(ho.y));

  // 顶上三个虫洞
  const wormholes = table.wormholes.map((w) => {
    const m = add(new THREE.Mesh(new THREE.RingGeometry(0.06, 0.16, 32), new THREE.MeshBasicMaterial({ map: diskTex, color: new THREE.Color(0x9fd4ff), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
    m.rotation.x = -Math.PI / 2;
    m.position.set(X(w.x), 0.006, Z(w.y));
    return m;
  });

  // 带环的行星 (飘在左上角)
  const planet = new THREE.Group();
  {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const g = c.getContext('2d');
    for (let y = 0; y < 128; y += 4) {
      g.fillStyle = `hsl(${215 + Math.sin(y * 0.3) * 10}, 18%, ${48 + Math.sin(y * 0.17) * 14}%)`;
      g.fillRect(0, y, 256, 4);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.32, 32, 20), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.62, 48), new THREE.MeshStandardMaterial({ color: 0xc8d2e4, transparent: true, opacity: 0.7, side: THREE.DoubleSide, roughness: 0.6 }));
    ring.rotation.x = Math.PI / 2.4;
    planet.add(shadow(ball, true, false), ring);
  }
  planet.position.set(X(70), 1.25, Z(110));
  planet.rotation.z = 0.35;
  add(planet);

  // 弹簧 + 推杆
  const plunger = new THREE.Group();
  {
    const coil = [];
    for (let i = 0; i <= 80; i++) {
      const a = i * 0.7;
      coil.push(new THREE.Vector3(Math.cos(a) * 0.07, 0.1 + Math.sin(a) * 0.07, (i / 80) * 0.3));
    }
    const spring = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil), 200, 0.008, 6), M.chrome);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 20), new THREE.MeshStandardMaterial({ color: 0x5a78b8, roughness: 0.4, metalness: 0.4 }));
    tip.rotation.x = Math.PI / 2;
    tip.position.set(0, 0.1, 0);
    plunger.add(spring, tip);
    plunger.userData.spring = spring;
  }
  plunger.position.set(X(560), 0, Z(table.plunger.top));
  add(plunger);

  // ---- 灯 (亮的时候盖一层发光的) ----
  const lamps = new Map();
  for (const ins of INSERTS) {
    let geo;
    if (ins.shape === 'circle') geo = new THREE.CircleGeometry(ins.size * S, 24);
    else if (ins.shape === 'ring') geo = new THREE.RingGeometry(ins.size * S - 0.025, ins.size * S + 0.01, 32);
    else {
      // 用画贴图的那个形状
      const pts = [];
      const fake = { beginPath() {}, moveTo: (x, y) => pts.push([x, y]), lineTo: (x, y) => pts.push([x, y]), closePath() {}, arc() {} };
      insertPath(fake, { ...ins, x: 0, y: 0 });
      geo = new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x * S, -y * S))));
    }
    geo.rotateX(-Math.PI / 2);
    const color = new THREE.Color(ins.color);
    const mat = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(ins.shape === 'circle' ? 1.1 : 1.6), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const m = add(new THREE.Mesh(geo, mat));
    m.position.set(X(ins.x), 0.003, Z(ins.y));
    lamps.set(ins.id, m);
  }

  // ---- 球 (最多 4 个, 不用的藏起来) ----
  const balls = Array.from({ length: 4 }, () => {
    const m = add(shadow(new THREE.Mesh(new THREE.SphereGeometry(BALL_R * S, 32, 24), M.ball), true, false));
    m.visible = false;
    return m;
  });

  // ---- 火花 ----
  const SPARKS = 220;
  const sparkPos = new Float32Array(SPARKS * 3);
  const sparkCol = new Float32Array(SPARKS * 3);
  const sparkVel = new Float32Array(SPARKS * 3);
  const sparkLife = new Float32Array(SPARKS);
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3));
  const sparks = add(new THREE.Points(sparkGeo, new THREE.PointsMaterial({ size: 0.05, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
  let sparkNext = 0;
  function burst(x, y, color, n = 14, height = 0.15) {
    const c = new THREE.Color(color).multiplyScalar(2);
    for (let i = 0; i < n; i++) {
      const j = sparkNext++ % SPARKS;
      sparkPos.set([X(x), height, Z(y)], j * 3);
      const a = Math.random() * Math.PI * 2;
      const sp2 = 0.6 + Math.random() * 1.6;
      sparkVel.set([Math.cos(a) * sp2, 0.5 + Math.random() * 1.5, Math.sin(a) * sp2], j * 3);
      sparkCol.set([c.r, c.g, c.b], j * 3);
      sparkLife[j] = 0.35 + Math.random() * 0.3;
    }
  }

  // ---- 危机 (大敌人): 飘在台面上空左右晃, 下面一排血点; 每章一个样子。打中了闪一下, 打败了炸开 ----
  //   彗星 (冰块 + 彗尾)、耀斑 (一团火 + 火环)、海盗船、黑洞潮汐 (黑球 + 一圈光)
  const BOSS_AT = { x: X(290), y: 1.5, z: Z(420) };
  const bossGroup = new THREE.Group();
  bossGroup.visible = false;
  add(bossGroup);
  function glowMat(color, k = 1.8, opacity = 1) {
    return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), transparent: opacity < 1, opacity, blending: opacity < 1 ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: opacity >= 1, toneMapped: false, side: opacity < 1 ? THREE.DoubleSide : THREE.FrontSide });
  }
  function lumpy(r, seed, detail = 2, rough = 0.2) {
    const geo = new THREE.IcosahedronGeometry(r, detail);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let j = 0; j < pos.count; j++) {
      v.fromBufferAttribute(pos, j);
      const n = 1 + rough * Math.sin(v.x * 9 + seed) * Math.sin(v.y * 11 + seed * 2) * Math.sin(v.z * 7 + seed * 3);
      pos.setXYZ(j, v.x * n, v.y * n, v.z * n);
    }
    geo.computeVertexNormals();
    return geo;
  }
  const bossModels = {};
  {
    // 彗星
    const g = new THREE.Group();
    const ice = new THREE.MeshStandardMaterial({ color: 0xd8ecff, roughness: 0.45, metalness: 0.1, emissive: 0x3f7dff, emissiveIntensity: 0.3, flatShading: true });
    g.add(new THREE.Mesh(lumpy(0.38, 3, 2, 0.25), ice));
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.42, 2.4, 24, 1, true), glowMat(0x8fd8ff, 1.4, 0.28));
    tail.geometry.rotateX(-Math.PI / 2);
    tail.position.set(0, 0.25, -1.2);
    tail.rotation.x = -0.2;
    g.add(tail);
    bossModels.comet = { g, mats: [ice], spin: (dt) => g.children[0].rotation.set(g.children[0].rotation.x + dt * 0.7, g.children[0].rotation.y + dt * 0.4, 0) };
  }
  {
    // 耀斑: 一团火, 两个火环
    const g = new THREE.Group();
    const fire = glowMat(0xff8a2a, 2.2);
    const core = new THREE.Mesh(lumpy(0.36, 7, 3, 0.12), fire);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 16), glowMat(0xff5a1a, 1.2, 0.18));
    const rings = [0, 1].map((k) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(0.62 + k * 0.12, 0.025, 8, 48), glowMat(k ? 0xffd84d : 0xff5a1a, 2, 0.8));
      m.rotation.set(1.2 + k * 0.6, k * 0.8, 0);
      return m;
    });
    g.add(core, halo, ...rings);
    bossModels.flare = { g, mats: [], spin: (dt, now) => (core.scale.setScalar(1 + Math.sin(now / 120) * 0.05), rings.forEach((r, k) => (r.rotation.z += dt * (k ? -1.4 : 1.1)))) };
  }
  {
    // 海盗船: 尖头冲着你, 两边翅膀, 红色的灯
    const g = new THREE.Group();
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x2a2e3a, metalness: 0.8, roughness: 0.35, emissive: 0x400010, emissiveIntensity: 0.4, flatShading: true });
    const hull = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.2, 4), hullMat);
    hull.geometry.rotateX(Math.PI / 2);
    hull.rotation.z = Math.PI / 4;
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.04, 0.38), hullMat);
    wing.position.z = -0.2;
    const fins = [-1, 1].map((k) => {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.32, 0.4), hullMat);
      f.position.set(k * 0.72, 0.12, -0.25);
      return f;
    });
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 10), glowMat(0xff2040, 2.4));
    eye.position.set(0, 0.12, 0.15);
    const engines = [-0.4, 0, 0.4].map((x) => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), glowMat(0xff5040, 2.2, 0.9));
      e.position.set(x, 0, -0.62);
      return e;
    });
    g.add(hull, wing, ...fins, eye, ...engines);
    bossModels.pirate = { g, mats: [hullMat], spin: (dt, now) => ((g.rotation.z = Math.sin(now / 500) * 0.25), engines.forEach((e, k) => e.scale.setScalar(1 + 0.3 * Math.sin(now / 60 + k)))) };
  }
  {
    // 黑洞潮汐: 黑球, 外面一圈紫光, 斜着一个吸积环
    const g = new THREE.Group();
    const hole = new THREE.Mesh(new THREE.SphereGeometry(0.34, 32, 20), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    const rim = new THREE.Mesh(new THREE.SphereGeometry(0.42, 32, 20), glowMat(0xbfe0ff, 1.6, 0.35));
    rim.material.side = THREE.BackSide;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.95, 64), new THREE.MeshBasicMaterial({ map: diskTex, color: new THREE.Color(0xbfe0ff).multiplyScalar(1.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2 + 0.45;
    g.add(hole, rim, ring);
    bossModels.void = { g, mats: [], spin: (dt) => (ring.rotation.z -= dt * 1.5) };
  }
  for (const m of Object.values(bossModels)) {
    m.g.visible = false;
    bossGroup.add(m.g);
  }
  // 血点
  const pipOn = glowMat(0xff3050, 2.2);
  const pipOff = new THREE.MeshBasicMaterial({ color: 0x3a3a48 });
  const pips = Array.from({ length: 10 }, () => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), pipOff);
    bossGroup.add(m);
    return m;
  });
  const bossView = { kind: null, appear: 0, dying: 0 };

  // ---- 终章: 新家园曙光星从台面顶上升起来 ----
  const home = new THREE.Group();
  {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#1d5fb8';
    g.fillRect(0, 0, 512, 256);
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i++) {
      g.fillStyle = `hsl(${95 + rnd() * 40}, 45%, ${32 + rnd() * 18}%)`;
      g.beginPath();
      g.ellipse(rnd() * 512, 40 + rnd() * 176, 20 + rnd() * 60, 10 + rnd() * 30, rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 40; i++) g.fillRect(rnd() * 512, rnd() * 256, 30 + rnd() * 80, 3 + rnd() * 5);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.62, 48, 32), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, emissive: 0x0a2040, emissiveIntensity: 0.4 }));
    const air = new THREE.Mesh(new THREE.SphereGeometry(0.72, 48, 32), glowMat(0x7fd8ff, 1.2, 0.22));
    air.material.side = THREE.BackSide;
    home.add(globe, air);
    home.userData.globe = globe;
  }
  home.position.set(X(535), 1.3, Z(95)); // 右上角 (跟左上角那颗带环的对称)
  home.visible = false;
  home.scale.setScalar(0.001);
  add(home);

  // 每章的颜色 (台面、两盏彩灯、两边的灯条、背景), 终章金色
  const PALETTES = [
    // (四章都是冷色的太空, 只有终章「曙光」暖一点; 颜色差一点点, 不要乱)
    { floor: 0xeef3ff, a: 0x9fd4ff, b: 0x3a6dff, bg: 0x02040b },
    { floor: 0xf0f2ff, a: 0xa8d0ff, b: 0x4a64ff, bg: 0x03040c },
    { floor: 0xecf6ff, a: 0x9fe0ff, b: 0x3a80ff, bg: 0x02060b },
    { floor: 0xeef0ff, a: 0xb4c8ff, b: 0x4a5aff, bg: 0x03030b },
    { floor: 0xfff7ee, a: 0xffe2b8, b: 0x7fb0ff, bg: 0x050608 },
  ].map((p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, new THREE.Color(v)])));
  const ledA = M.led.color;
  const ledB = M.ledPink.color;
  const tmp = new THREE.Color();
  function paint(pal, k) {
    floorMat.color.lerp(pal.floor, k);
    cyan.color.lerp(pal.a, k);
    pink.color.lerp(pal.b, k);
    ledA.lerp(tmp.copy(pal.a).multiplyScalar(2), k);
    ledB.lerp(tmp.copy(pal.b).multiplyScalar(2), k);
    scene.background.lerp(pal.bg, k);
  }
  floorMat.color.set(0xffffff);
  paint(PALETTES[0], 1);

  function burstAt(wx, wy, wz, color, n = 30, speed = 2.2) {
    const c = new THREE.Color(color).multiplyScalar(2);
    for (let i = 0; i < n; i++) {
      const j = sparkNext++ % SPARKS;
      sparkPos.set([wx, wy, wz], j * 3);
      const a = Math.random() * Math.PI * 2;
      const u = Math.random() * 2 - 1;
      const sp = speed * (0.4 + Math.random() * 0.6);
      sparkVel.set([Math.cos(a) * Math.sqrt(1 - u * u) * sp, u * sp, Math.sin(a) * Math.sqrt(1 - u * u) * sp], j * 3);
      sparkCol.set([c.r, c.g, c.b], j * 3);
      sparkLife[j] = 0.5 + Math.random() * 0.5;
    }
  }

  // ---- 机库: 台子立在远航号的机库甲板上; 两边货箱、燃料罐、控制台、停着的穿梭机, 后面机库大门开着, 外面是太空 ----
  const FLOOR = -1.05;
  const canvasTex = (w, h, draw, { repeat = null } = {}) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(...repeat);
    }
    t.anisotropy = 4;
    return t;
  };
  const deckTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#1b2233';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 128) {
      for (let x = 0; x < w; x += 128) {
        const gr = g.createLinearGradient(x, y, x + 128, y + 128);
        gr.addColorStop(0, '#2c3650');
        gr.addColorStop(1, '#1a2134');
        g.fillStyle = gr;
        g.fillRect(x + 2, y + 2, 124, 124);
        g.fillStyle = 'rgba(200,210,240,0.25)';
        for (const [rx, ry] of [[8, 8], [120, 8], [8, 120], [120, 120]]) g.fillRect(x + rx - 2, y + ry - 2, 4, 4);
        // 防滑的纹
        g.strokeStyle = 'rgba(255,255,255,0.05)';
        for (let k = 16; k < 112; k += 12) {
          g.beginPath();
          g.moveTo(x + k, y + 20);
          g.lineTo(x + k + 8, y + 28);
          g.stroke();
        }
      }
    }
  }, { repeat: [11, 11] });
  const deck = add(new THREE.Mesh(new THREE.PlaneGeometry(44, 44), new THREE.MeshStandardMaterial({ map: deckTex, roughness: 0.7, metalness: 0.4 })));
  deck.rotation.x = -Math.PI / 2;
  deck.position.y = FLOOR;
  deck.receiveShadow = true;
  // 台子周围一圈黄黑的停机线
  const stripeTex = canvasTex(256, 32, (g, w, h) => {
    g.fillStyle = '#0d121e';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#4a6494';
    for (let x = -h; x < w; x += 32) {
      g.beginPath();
      g.moveTo(x, h);
      g.lineTo(x + 16, h);
      g.lineTo(x + 16 + h, 0);
      g.lineTo(x + h, 0);
      g.fill();
    }
  }, { repeat: [6, 1] });
  const stripeMat = new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.6 });
  for (const [w, d, x, z, rot] of [[8.4, 0.25, 0, -6.1, 0], [8.4, 0.25, 0, 6.9, 0], [13.2, 0.25, -4.2, 0.4, Math.PI / 2], [13.2, 0.25, 4.2, 0.4, Math.PI / 2]]) {
    const st = add(new THREE.Mesh(new THREE.PlaneGeometry(w, d), stripeMat));
    st.rotation.set(-Math.PI / 2, 0, rot);
    st.position.set(x, FLOOR + 0.005, z);
  }
  // 机柜: 台面下面的箱子, 两边印着远航号, 前面一根镀铬的横杆
  const sideTex = canvasTex(1024, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#2a2060');
    gr.addColorStop(1, '#0e0b26');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(120,140,220,0.35)';
    for (let x = 0; x < w; x += 128) g.strokeRect(x + 2, 6, 124, h - 12);
    g.fillStyle = '#7fd0ff';
    g.fillRect(0, h - 8, w, 4);
    g.font = '900 58px "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
    g.textBaseline = 'middle';
    g.shadowColor = '#5fd8ff';
    g.shadowBlur = 16;
    g.fillStyle = '#e6f4ff';
    g.fillText('远航号 · 殖民方舟', 60, h / 2);
    g.shadowBlur = 0;
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.font = '700 22px "PingFang SC", "Microsoft YaHei", sans-serif';
    g.fillText('乘客 100,000 · 冬眠中', 640, h / 2 + 4);
  });
  const sideMat = new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.5, metalness: 0.3 });
  // (顶面比台面低一点, 不然两个面打架, 台面一闪一闪的)
  const body = add(shadow(new THREE.Mesh(new THREE.BoxGeometry(6.2, -FLOOR - 0.04, 10.9), [sideMat, sideMat, M.cabinet, M.cabinet, M.cabinet, M.cabinet]), true, true));
  body.position.set(0, (FLOOR - 0.04) / 2, 0.42);
  const barMat = new THREE.MeshStandardMaterial({ color: 0x8c93a6, metalness: 0.9, roughness: 0.4 });
  const bar = add(shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 6.1, 20), barMat)));
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, 0.56, Z(1052));

  // 货箱: 印着字的箱子, 堆两层
  const crateTex = (label, color) =>
    canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = color;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(0,0,0,0.45)';
      g.lineWidth = 14;
      g.strokeRect(7, 7, w - 14, h - 14);
      g.beginPath();
      g.moveTo(14, 14);
      g.lineTo(w - 14, h - 14);
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.font = '900 44px "PingFang SC", "Microsoft YaHei", sans-serif';
      g.textAlign = 'center';
      g.fillText(label, w / 2, h / 2 + 15);
    });
  const crateMats = [crateTex('补给', '#3a4a66'), crateTex('种子', '#46526e'), crateTex('氧气', '#2e3c58')].map((map) => new THREE.MeshStandardMaterial({ map, roughness: 0.8 }));
  for (const [x, y, z, size, k, rot] of [[-4.6, 0, 2.4, 0.9, 0, 0.1], [-4.6, 0.9, 2.5, 0.8, 1, -0.2], [-5.7, 0, 3.0, 0.9, 2, 0.4], [-4.8, 0, 4.4, 0.6, 1, 0.8], [4.6, 0, -3.2, 0.8, 2, -0.3], [5.4, 0, -2.6, 0.6, 0, 0.5]]) {
    const c = add(shadow(new THREE.Mesh(new THREE.BoxGeometry(size, size, size), crateMats[k])));
    c.position.set(x, FLOOR + y + size / 2, z);
    c.rotation.y = rot;
  }
  // 燃料罐: 躺着的两个, 有红色的箍
  const tankMat = new THREE.MeshStandardMaterial({ color: 0xc8ccd6, metalness: 0.7, roughness: 0.3 });
  const bandMat = new THREE.MeshStandardMaterial({ color: 0x3a5a9a, roughness: 0.5 });
  for (const z of [-1.4, -0.4]) {
    const tank = add(shadow(new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 1.4, 6, 16), tankMat)));
    tank.rotation.z = Math.PI / 2;
    tank.position.set(-5.4, FLOOR + 0.4, z);
    for (const x of [-0.5, 0.5]) {
      const band = add(new THREE.Mesh(new THREE.TorusGeometry(0.385, 0.03, 8, 32), bandMat));
      band.rotation.y = Math.PI / 2;
      band.position.set(-5.4 + x, FLOOR + 0.4, z);
    }
  }
  // 控制台: 斜着的屏幕, 上面是星图和远航号的状态
  const screenTex = canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#031020';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(80,220,255,0.7)';
    g.lineWidth = 2;
    for (const r of [40, 75, 110]) {
      g.beginPath();
      g.arc(150, 128, r, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = '#ffd84d';
    for (const [x, y] of [[150, 128], [205, 92], [100, 190], [240, 160]]) {
      g.beginPath();
      g.arc(x, y, 6, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#7ff3ff';
    g.font = '700 26px "PingFang SC", "Microsoft YaHei", sans-serif';
    g.fillText('航线: 曙光星', 300, 60);
    g.fillText('冬眠舱 正常', 300, 110);
    g.fillText('燃料 78%', 300, 160);
    g.fillStyle = '#3dffa8';
    g.fillRect(300, 180, 160, 12);
  });
  const consoleGroup = new THREE.Group();
  {
    const desk = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.75, 0.8), M.darkMetal);
    desk.position.y = 0.375;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
    screen.position.set(0, 1.05, -0.2);
    screen.rotation.x = -0.35;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.85, 0.05), M.darkMetal);
    frame.position.set(0, 1.05, -0.23);
    frame.rotation.x = -0.35;
    consoleGroup.add(shadow(desk), shadow(frame), screen);
    for (let i = 0; i < 8; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.08), glowMat([0x7fd0ff, 0xe8f2ff, 0x7fd0ff][i % 3], 2));
      b.position.set(-0.6 + i * 0.17, 0.76, 0.2);
      consoleGroup.add(b);
    }
  }
  consoleGroup.position.set(-4.9, FLOOR, -3.6);
  consoleGroup.rotation.y = 0.9;
  add(consoleGroup);
  // 穿梭机: 停在右边, 机身、三角翼、尾翼、驾驶舱的玻璃、发动机的光
  const shuttle = new THREE.Group();
  {
    const white = new THREE.MeshStandardMaterial({ color: 0xe8ecf4, metalness: 0.3, roughness: 0.45 });
    const fuse = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 1.9, 8, 20), white);
    fuse.rotation.x = Math.PI / 2;
    const wingShape = new THREE.Shape([new THREE.Vector2(0, 0.6), new THREE.Vector2(1.3, -0.7), new THREE.Vector2(-1.3, -0.7)]);
    const wing = new THREE.Mesh(new THREE.ExtrudeGeometry(wingShape, { depth: 0.06, bevelEnabled: false }), white);
    wing.rotation.x = Math.PI / 2;
    wing.position.set(0, -0.05, 0.1);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, 0.6), white);
    fin.position.set(0, 0.42, 0.85);
    const glass = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0x2a6a9a, roughness: 0.05, metalness: 0.2, clearcoat: 1 }));
    glass.position.set(0, 0.18, -0.8);
    glass.scale.set(1, 0.7, 1.4);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 1.6), bandMat);
    stripe.position.set(0, 0.3, 0.1);
    const engines = [-0.18, 0.18].map((x) => {
      const e = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.2, 16), glowMat(0x6ab8ff, 2));
      e.rotation.x = Math.PI / 2;
      e.position.set(x, 0, 1.3);
      return e;
    });
    const gear = [[-0.5, 0.2], [0.5, 0.2], [0, -0.7]].map(([x, z]) => {
      const g2 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.45, 8), M.darkMetal);
      g2.position.set(x, -0.45, z);
      return g2;
    });
    shuttle.add(shadow(fuse), shadow(wing), shadow(fin), glass, stripe, ...engines, ...gear);
  }
  shuttle.position.set(6.1, FLOOR + 0.68, 1.4);
  shuttle.rotation.y = -0.7;
  add(shuttle);
  // 柱子 (上面一圈灯) 和后面开着的机库大门
  const lampRing = glowMat(0x9fd8ff, 1.6);
  for (const [x, z] of [[-4.2, -6.4], [4.2, -6.4], [-7.5, 2], [7.5, -1], [-4.2, 7.2], [4.2, 7.2]]) {
    const col = add(shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 4, 12), M.darkMetal)));
    col.position.set(x, FLOOR + 2, z);
    const ring = add(new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.03, 6, 20), lampRing));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, FLOOR + 1.4, z);
  }
  {
    const doorMat = new THREE.MeshStandardMaterial({ map: stripeTex.clone(), roughness: 0.6, metalness: 0.4 });
    doorMat.map.repeat.set(12, 1);
    doorMat.map.needsUpdate = true;
    for (const [w, h, x, y] of [[0.6, 7, -7.5, 2.5], [0.6, 7, 7.5, 2.5], [15.6, 0.6, 0, 6.2]]) {
      const f = add(new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.6), doorMat));
      f.position.set(x, FLOOR + y, -10.5);
    }
  }

  // 挡板下面那块 (apron) 上的两条表: 左边护盾还剩多久, 右边任务还剩多久 / 危机的血 / 曲速几级
  const meters = [0, 1].map((k) => {
    const track = add(new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.02, 0.12), M.darkMetal));
    const x = k ? X(418) : X(142);
    track.position.set(x, 0.125, Z(1034));
    const fillMat = glowMat(0x7fd0ff, 2);
    const fill = add(new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.025, 0.08), fillMat));
    fill.position.set(x, 0.13, Z(1034));
    return { fill, x, mat: fillMat };
  });

  // ---- 天上的星星 (镜头歪的时候看得见) ----
  {
    const n = 1500;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = 30 + Math.random() * 10;
      p.set([Math.sqrt(1 - u * u) * Math.cos(a) * r, Math.abs(u) * r * 0.8 - 4, Math.sqrt(1 - u * u) * Math.sin(a) * r], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xbfd0ff, size: 0.08, sizeAttenuation: true })));
  }

  // ---- 后期: 发光 ----
  const composer = new THREE.EffectComposer(renderer);
  composer.addPass(new THREE.RenderPass(scene, camera));
  const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(256, 256), low ? 0.5 : 0.6, 0.35, 0.95);
  composer.addPass(bloom);
  composer.addPass(new THREE.OutputPass());

  // ---- 大小、镜头 ----
  //   「整张台」: 镜头斜着从上面看, 远近、往哪看按屏幕大小算好, 整张台 (连两个角上的星球) 正好放得下 (竖着的屏幕只用这个)
  //   「跟着球」: 低一点、近一点, 宽度放得下, 镜头跟着最下面那个球上下走 (到头了就停)
  let width = 1;
  let height = 1;
  let maxRatio = low ? 1.5 : 2;
  let level = 0; // 画面降了几级 (太卡的时候)
  let follow = true;
  let view = null; // { pitch, dist, lookZ, zTop, zBot }
  const camState = { z: 0, shake: 0 };
  const V = (x, y, z) => new THREE.Vector3(X(x), z * S, Z(y));
  const EDGE = [...outline.map(([x, y]) => V(x, Math.min(y, 1060), 50)), V(12, 1060, 0), V(588, 1060, 0), V(70, 110, 160), V(535, 95, 190), V(300, 52, 140)];
  const TOP = V(300, 0, 50);
  const BOTTOM = V(300, 1030, 0);
  const SIDES = [V(0, 500, 50), V(600, 500, 50)];
  const pv = new THREE.Vector3();
  function aim(pitch, dist, lookZ) {
    camera.position.set(0, Math.sin(pitch) * dist, lookZ + Math.cos(pitch) * dist);
    camera.lookAt(0, 0, lookZ);
    camera.updateMatrixWorld();
  }
  const ndc = (p) => pv.copy(p).project(camera);
  function fits(pts, pitch, dist, lookZ, edge = 0.96) {
    aim(pitch, dist, lookZ);
    return pts.every((p) => {
      const q = ndc(p);
      return q.z > -1 && q.z < 1 && Math.abs(q.x) <= edge && Math.abs(q.y) <= edge;
    });
  }
  // 二分: f(x) 从 false 变成 true 的地方
  function search(lo, hi, f) {
    for (let k = 0; k < 24; k++) {
      const mid = (lo + hi) / 2;
      if (f(mid)) hi = mid;
      else lo = mid;
    }
    return hi;
  }
  function fitView() {
    const portrait = width / height < 0.85;
    camera.fov = portrait ? 46 : 38;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (portrait || !follow) {
      // 试几个角度、往哪看, 挑台面在屏幕上最大的那个
      const tries = [];
      for (const deg of portrait ? [56, 60, 64, 68] : [50, 54, 58]) {
        const pitch = (deg * Math.PI) / 180;
        for (let lookZ = -2; lookZ <= 3; lookZ += 0.1) {
          const dist = search(3, 60, (d) => fits(EDGE, pitch, d, lookZ));
          aim(pitch, dist, lookZ);
          let [x0, x1, y0, y1] = [1, -1, 1, -1];
          for (const p of EDGE) {
            const q = ndc(p);
            [x0, x1, y0, y1] = [Math.min(x0, q.x), Math.max(x1, q.x), Math.min(y0, q.y), Math.max(y1, q.y)];
          }
          tries.push({ pitch, dist, lookZ, area: (x1 - x0) * (y1 - y0), mid: Math.abs(y0 + y1) });
        }
      }
      // 差不多一样大的里面挑上下最居中的 (竖着的屏幕上不会一头空着, 下面的发射钮也不挡着球)
      const most = Math.max(...tries.map((t) => t.area));
      const best = tries.filter((t) => t.area > most * 0.97).sort((a, b) => a.mid - b.mid)[0];
      view = { ...best, zTop: best.lookZ, zBot: best.lookZ };
      return;
    }
    const pitch = (50 * Math.PI) / 180;
    const dist = search(3, 60, (d) => fits(SIDES, pitch, d, 0, 0.66));
    // 镜头往前 (lookZ 大) 走, 台面上的东西在屏幕上往上跑: 顶上那头不出去 → lookZ ≤ zTop; 下面那头不出去 → lookZ ≥ zBot
    const y = (p, lookZ) => (aim(pitch, dist, lookZ), ndc(p).y);
    const zTop = search(-8, 8, (z) => y(TOP, z) > 0.9);
    const zBot = search(-8, 8, (z) => y(BOTTOM, z) > -0.94);
    view = zBot <= zTop ? { pitch, dist, lookZ: (zTop + zBot) / 2, zTop: (zTop + zBot) / 2, zBot: (zTop + zBot) / 2 } : { pitch, dist, lookZ: zBot, zTop, zBot };
    camState.z = view.zBot;
  }

  function resize(w, h, dpr = window.devicePixelRatio || 1) {
    width = Math.max(1, w);
    height = Math.max(1, h);
    const ratio = Math.min(dpr, maxRatio);
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(ratio);
    composer.setSize(width, height);
    fitView();
  }

  function placeCamera(game, dt) {
    let lookZ = view.lookZ;
    if (view.zTop < view.zBot) {
      const live = game.balls.filter((b) => !b.held);
      const ballZ = live.length ? Math.max(...live.map((b) => Z(b.y))) : Z(H);
      const want = Math.max(view.zTop, Math.min(view.zBot, ballZ + 0.4));
      camState.z += (want - camState.z) * Math.min(1, dt * 3);
      lookZ = camState.z;
    }
    aim(view.pitch, view.dist, lookZ);
    if (camState.shake > 0) {
      const k = camState.shake * 0.05;
      camera.position.x += (Math.random() - 0.5) * k;
      camera.position.y += (Math.random() - 0.5) * k;
      camState.shake = Math.max(0, camState.shake - dt * 3);
    }
  }

  // 太卡了: 一级一级降 (像素 → 影子 → 发光), 降到头返回 false
  function degrade() {
    level++;
    if (level === 1) {
      maxRatio = 1;
      resize(width, height);
    } else if (level === 2) key.castShadow = false;
    else if (level === 3) bloom.enabled = false;
    return level < 3;
  }

  // ---- 每帧 ----
  const blink = (now, ms = 260) => Math.floor(now / ms) % 2 === 0;
  let robotWave = 0;
  let spinAngle = 0;
  function lamp(id, on, strength = 1) {
    const m = lamps.get(id);
    if (m) m.material.opacity += ((on ? 0.8 * strength : 0) - m.material.opacity) * 0.5;
  }

  function render(game, dt, now) {
    const table = game.table; // (重新开始一局是新的台面, 样子一样)
    const s = game.state;
    const fl = game.flash;
    // 挡板
    table.flippers.forEach((f, i) => (flippers[i].rotation.y = -f.angle));
    // 球
    balls.forEach((m, i) => {
      const b = game.balls[i];
      m.visible = Boolean(b);
      if (!b) return;
      const sink = b.held ? Math.min(1, (1.3 - b.held.left) * 3) : 0;
      m.position.set(X(b.x), (b.z ?? 0) * S + BALL_R * S + 0.002 - sink * 0.12, Z(b.y));
      m.scale.setScalar(1 - sink * 0.5);
      m.rotation.x += (b.vy * S * dt) / (BALL_R * S);
      m.rotation.z -= (b.vx * S * dt) / (BALL_R * S);
    });
    // 小行星
    bumpers.forEach((b, i) => {
      const f = fl.bumper[i];
      b.stone.rotation.y += dt * (0.3 + i * 0.1);
      b.stone.rotation.x += dt * 0.15;
      b.stone.scale.setScalar(1 + f * 0.8);
      b.ringMat.color.copy(b.color).multiplyScalar(f > 0 ? 4 : 1.2);
    });
    slingMeshes.forEach((m, i) => (m.material.emissiveIntensity = fl.sling[i] > 0 ? 2.2 : 0.15));
    // 掉落靶: 打下去了沉到台面下面
    table.drops.forEach((d, i) => {
      const m = drops[i];
      m.position.y += ((d.up ? 0.11 : -0.12) - m.position.y) * Math.min(1, dt * 18);
      m.material.emissiveIntensity = fl.drop[i] > 0 ? 3 : 0.1;
    });
    table.targets.forEach((_, i) => (targets[i].material.emissiveIntensity = fl.target[i] > 0 ? 3 : s.targets[i] ? 1.2 : 0.1));
    // 推进器
    spinAngle += dt * fl.spinner * 60;
    spinner.rotation.x = spinAngle;
    // 黑洞、飞碟、虫洞
    disk.rotation.z -= dt * (0.8 + fl.hole * 4);
    ufo.rotation.y += dt * (0.6 + fl.hole * 6);
    ufo.position.y = 0.75 + Math.sin(now / 600) * 0.04;
    ufo.userData.lightMat.color.set(0x7fd0ff).multiplyScalar(fl.hole > 0 ? 2.6 : 1.5);
    beam.material.opacity = fl.hole > 0 ? 0.25 + 0.1 * Math.sin(now / 50) : s.lockLit ? 0.08 + 0.06 * Math.sin(now / 200) : 0;
    wormholes.forEach((w) => (w.rotation.z += dt * 2));
    planet.rotation.y += dt * 0.15;
    // 弹簧
    const pull = s.pull;
    plunger.position.z = Z(table.plunger.top) + pull * 30 * S;
    plunger.userData.spring.scale.z = 1 - pull * 0.6;
    // 灯
    s.lanes.forEach((on, i) => lamp(`lane${i}`, on || fl.lane[i] > 0 || (s.skillLane === i && blink(now, 180))));
    for (let i = 0; i < 5; i++) lamp(`warp${i}`, s.warp > i || (s.warp === i && blink(now, 400)), s.warp > i ? 1 : 0.5);
    lamp('jackpot', s.multiball && blink(now, 150));
    lamp('orbit', fl.orbit > 0 || blink(now, 900));
    lamp('spinner', fl.spinner > 0);
    lamp('lock', s.lockLit ? blink(now, 200) : s.locked > 0);
    lamp('ready', (s.missionReady || s.bossReady || s.finalReady) && blink(now, 220));
    s.targets.forEach((on, i) => lamp(`target${i}`, on || fl.target[i] > 0));
    table.drops.forEach((d, i) => lamp(`drop${i}`, !d.up));
    [2, 3, 4, 5].forEach((n, i) => lamp(`mult${i}`, s.mult >= n));
    lamp('kickback', s.kickback);
    lamp('shield', s.saveLeft > 0 && (s.saveLeft > 3 || blink(now, 150)));
    const aimed = new Set([...game.aims()].flatMap((x) => AIM[x] ?? []));
    for (const id of ['aimRamp', 'aimOrbit', 'aimHole', 'aimDrops', 'aimTargets', 'aimBumpers']) lamp(id, aimed.has(id) && blink(now, s.boss || s.final ? 160 : 300));
    // 黑洞旁边的任务 / 危机 / 着陆, 对接了几次, 连击, 五个星系, 奖励的球
    lamp('iMission', s.mission ? true : s.missionReady && blink(now, 220));
    lamp('iBoss', s.boss ? blink(now, 120) : s.bossReady && blink(now, 220));
    lamp('iLand', s.final ? blink(now, 140) : s.finalReady && blink(now, 220));
    lamp('dock0', s.docks >= 1 || s.lockLit);
    lamp('dock1', s.lockLit);
    lamp('combo', s.combo.n >= 2 && game.time - s.combo.at < game.perk.comboWindow);
    const ending = s.final || s.finalReady;
    for (let i = 0; i < 4; i++) lamp(`chapter${i}`, i < s.chapter || ending || (i === s.chapter && blink(now, 600)));
    lamp('chapter4', ending && blink(now, 300));
    lamp('extra', s.extra > 0);
    // 对接舱: 灯一个一个跑, 打上去的时候夹子合一下
    const chase = Math.floor(now / 110) % gantryLights.length;
    gantryLights.forEach((l, i) => l.scale.setScalar(fl.dock > 0 || i === chase ? 1.4 : 0.7));
    gantry.userData.clamps.forEach((arm, i) => (arm.position.x = (i ? 1 : -1) * (0.36 - Math.min(1, fl.dock * 2) * 0.13)));
    // 远航号、雷达、机器人
    ark.userData.ring.rotation.x += dt * 0.8;
    ark.position.y = 1.15 + Math.sin(now / 900) * 0.04;
    radar.rotation.y += dt * 0.9;
    radar.userData.tip.visible = blink(now, 500);
    robot.userData.eye.scale.x = Math.floor(now / 160) % 25 === 0 ? 0.2 : 1;
    robot.userData.bulb.visible = blink(now, 700);
    robotWave = Math.max(0, robotWave - dt);
    robot.userData.arms.forEach((a, i) => (a.rotation.z = robotWave > 0 ? (i ? -1 : 1) * (1.6 + Math.sin(now / 90) * 0.5) : (i ? -1 : 1) * 0.1));
    // 两条表
    const m0 = Math.min(1, s.saveLeft / Math.max(1, game.perk.saveTime));
    let m1 = s.warp / WARP_MAX;
    let c1 = 0x7fd0ff;
    if (s.mission) m1 = s.mission.left / s.mission.total;
    else if (s.boss) [m1, c1] = [s.boss.hp / s.boss.max, 0xff4a5a];
    else if (s.final) [m1, c1] = [1 - s.final.lit.length / 6, 0xffb44d];
    meters.forEach((m, i) => {
      const k = Math.max(0.001, i ? m1 : m0);
      m.fill.scale.x = k;
      m.fill.position.x = m.x - (1.24 * (1 - k)) / 2;
    });
    meters[1].mat.color.set(c1).multiplyScalar(2);
    // 这一章的颜色
    paint(s.final || s.finalReady ? PALETTES[4] : PALETTES[s.chapter], Math.min(1, dt * 1.5));
    // 危机
    const def = s.boss || s.bossReady ? CHAPTERS[s.chapter].boss : null;
    if (def && bossView.dying <= 0) {
      if (bossView.kind !== def.kind) {
        for (const [k, m] of Object.entries(bossModels)) m.g.visible = k === def.kind;
        bossView.kind = def.kind;
        bossView.appear = 0;
      }
      bossView.appear = Math.min(1, bossView.appear + dt * 1.2);
    } else if (bossView.dying > 0) bossView.dying = Math.max(0, bossView.dying - dt * 1.4);
    else bossView.appear = Math.max(0, bossView.appear - dt * 2);
    const bossK = bossView.dying > 0 ? bossView.dying : bossView.appear;
    bossGroup.visible = bossK > 0.01 && bossView.kind !== null;
    if (bossGroup.visible) {
      const m = bossModels[bossView.kind];
      const far = s.bossReady ? 1 : 0; // 还没开打: 远一点、高一点
      bossGroup.position.set(BOSS_AT.x + Math.sin(now / 1400) * (far ? 0.3 : 0.75), BOSS_AT.y + far * 0.7 + Math.sin(now / 700) * 0.06, BOSS_AT.z - far * 1.4);
      m.g.scale.setScalar((0.5 + 0.8 * bossK) * (1 + fl.boss * 0.5) * (far ? 0.75 : 1));
      m.spin(dt, now);
      for (const mat of m.mats) mat.emissiveIntensity = fl.boss > 0 ? 3 : 0.3;
      const hp = s.boss?.hp ?? def?.hp ?? 0;
      const max = s.boss?.max ?? def?.hp ?? 0;
      pips.forEach((p, i) => {
        p.visible = i < max && bossView.dying <= 0;
        p.material = i < hp ? pipOn : pipOff;
        p.position.set((i - (max - 1) / 2) * 0.15, -0.78, 0.2);
      });
    }
    // 终章: 曙光星
    const homeOn = Boolean(s.final || s.finalReady);
    home.visible = homeOn || home.scale.x > 0.01;
    home.scale.setScalar(Math.max(0.001, home.scale.x + ((homeOn ? 1 : 0) - home.scale.x) * Math.min(1, dt * 1.5)));
    home.userData.globe.rotation.y += dt * 0.12;
    // 火花
    for (const e of game.events) {
      if (e.type === 'bumper') burst(e.x, e.y, 0x9fd4ff, 16, 0.25);
      else if (e.type === 'sling') burst(e.x, e.y, 0xbfe0ff, 10);
      else if (e.type === 'hole' || e.type === 'eject') burst(ho.x, ho.y, 0xdfeeff, 24, 0.1);
      else if (e.type === 'wormhole') burst(e.x, 72, 0x9fd4ff, 20, 0.1);
      if (['bossDown', 'missionDone', 'jackpot', 'landing', 'skill'].includes(e.type)) robotWave = 2;
      if (e.type === 'dock') burstAt(gantry.position.x, 0.6, gantry.position.z, 0x9fd4ff, 24, 1.4);
      if (e.type === 'bossHit') burstAt(bossGroup.position.x, bossGroup.position.y, bossGroup.position.z, 0xffffff, 26, 1.6);
      else if (e.type === 'bossDown') {
        bossView.dying = 1;
        camState.shake = 1.4;
        burstAt(bossGroup.position.x, bossGroup.position.y, bossGroup.position.z, 0xffb040, 90, 3.2);
      } else if (e.type === 'landing') {
        camState.shake = 1.2;
        burstAt(home.position.x, home.position.y, home.position.z + 1, 0xffe8c8, 90, 3);
      } else if (['jackpot', 'multiball', 'hyperspace', 'bossStart', 'finalStart', 'travel'].includes(e.type)) camState.shake = 1;
      else if (e.type === 'tilt' || e.type === 'bump') camState.shake = 0.6;
    }
    let live = false;
    for (let j = 0; j < SPARKS; j++) {
      if (sparkLife[j] <= 0) {
        sparkPos[j * 3 + 1] = -5;
        continue;
      }
      live = true;
      sparkLife[j] -= dt;
      sparkVel[j * 3 + 1] -= 6 * dt;
      for (let a = 0; a < 3; a++) sparkPos[j * 3 + a] += sparkVel[j * 3 + a] * dt;
      if (sparkPos[j * 3 + 1] < 0.01) sparkPos[j * 3 + 1] = 0.01;
    }
    if (live || sparkNext) sparkGeo.attributes.position.needsUpdate = sparkGeo.attributes.color.needsUpdate = true;
    placeCamera(game, dt);
    composer.render(dt);
  }

  return {
    render,
    resize,
    degrade,
    setFollow(on) {
      follow = on;
      fitView();
    },
    dispose() {
      for (const m of meshes) {
        m.traverse?.((o) => {
          o.geometry?.dispose();
          for (const mat of [o.material].flat()) mat?.dispose?.();
        });
      }
      artTex.dispose();
      diskTex.dispose();
      apronTex.dispose();
      composer.dispose?.();
      scene.environment.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
}
