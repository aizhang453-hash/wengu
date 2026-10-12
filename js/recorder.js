// 录音: 用麦克风录一小段 (Quizlet 会员才能给卡片录自己的发音)

export function canRecord() {
  return Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== 'undefined';
}

// 开始录; 返回 { stop, done }: stop() 停下, done 是录好的 Blob。最长 maxMs, 到了自己停
export async function record({ maxMs = 15000, onTick = null } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const rec = new MediaRecorder(stream);
  const chunks = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  let finish;
  const done = new Promise((resolve) => (finish = resolve));
  const started = Date.now();
  const timer = setInterval(() => {
    const ms = Date.now() - started;
    onTick?.(ms);
    if (ms >= maxMs) stop();
  }, 200);
  rec.onstop = () => {
    clearInterval(timer);
    for (const t of stream.getTracks()) t.stop();
    finish(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
  };
  rec.start();
  function stop() {
    if (rec.state !== 'inactive') rec.stop();
    return done;
  }
  return { stop, done };
}
