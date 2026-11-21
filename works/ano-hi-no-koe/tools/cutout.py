"""『あの日の声』立ち絵の背景透過（無地の明るい背景向け）。2026-11-21

使い方（リポジトリ直下で）:
  python3 -I works/ano-hi-no-koe/tools/cutout.py works/ano-hi-no-koe/tools/cutout-holes.json \
      <元画像.png> works/ano-hi-no-koe/assets/chars/<キャラID>_<表情>.png [...]

手順:
 1) 外周 4px の中央値を背景色 B、各画素の距離 d = max|P-B|（チャンネル別）
    cutout-holes.json の "_bgmode" で "rows" を指定したキーは、行ごとに左右の縁 4px の中央値（縦 15 行でならす）を B とする
    （上下で色が変わる背景向け。藤堂蓮の素材で追加。指定の無いキーは従来どおり）
 2) d<=20 で画像の縁につながる連結成分＝背景（端からのフラッドフィル）
 3) 体に囲まれた背景（腕と胴の間・髪の房の間など）は自動では抜かない（白シャツ・カーディガンと見分けられないため）。
    目視で背景と判断したものだけを cutout-holes.json で指定する：
      bbox  … d<=10 の成分（150px 以上）の外接矩形 [x0,y0,x1,y1] と完全一致したものを抜く
      _seeds … 150px 未満の小さい隙間は点 [x,y] で指定（その点、無ければ半径 6px 以内で最も近い d<=10 の成分。400px 超は拒否）
 4) 背景に 6px 以内で接する、幅 3px 以下・150px 未満の d<=20 の切れ端（細い毛先の間）も抜く
 5) 境界のなじませ：背景から 2px 以内の画素は alpha = min(d の傾斜 8..48, 1.15*d/近傍5x5の最大d（最大>=96 のとき）)。
    P = aC + (1-a)B から色 C を戻し、明るい背景のにじみを残さない
キー（出力ファイル名から .png を除いたもの）ごとに、抜いた穴と指定の取りこぼし（missing）を 1 行の JSON で出す。
"""
import sys, json
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

T_FILL, T_HOLE, T_LO, T_HI, BAND = 20, 10, 8, 48, 2


def cutout(src, dst, holes, seeds, bgmode="flat"):
    im = np.asarray(Image.open(src).convert("RGB")).astype(np.float32)
    border = np.concatenate([im[:4].reshape(-1, 3), im[-4:].reshape(-1, 3), im[:, :4].reshape(-1, 3), im[:, -4:].reshape(-1, 3)])
    B = np.median(border, axis=0)
    if bgmode == "rows":
        # 上下で色が変わる背景（床の帯など）用：行ごとに左右の縁 4px の中央値を取り、縦 15 行でならす
        sides = np.concatenate([im[:, :4], im[:, -4:]], axis=1)
        B = ndi.uniform_filter1d(np.median(sides, axis=1), size=15, axis=0, mode="nearest")[:, None, :]
    d = np.abs(im - B).max(axis=2)
    soft = d <= T_FILL
    lab, _ = ndi.label(soft)
    edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    bg = np.isin(lab, edge[edge > 0])

    used, missing = [], []
    lab2, n2 = ndi.label((d <= T_HOLE) & ~bg)
    for i in range(1, n2 + 1):
        m = lab2 == i
        if m.sum() < 150:
            continue
        ys, xs = np.where(m)
        bb = [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]
        if bb in holes:
            bg |= ndi.binary_dilation(m, iterations=2) & soft
            used.append(bb)
    missing += [b for b in holes if b not in used]
    for px, py in seeds:
        k = lab2[py, px]
        if k == 0:
            win = lab2[max(py - 6, 0):py + 7, max(px - 6, 0):px + 7]
            yy, xx = np.nonzero(win)
            if len(yy):
                j = np.argmin((yy - min(py, 6)) ** 2 + (xx - min(px, 6)) ** 2)
                k = win[yy[j], xx[j]]
        if k == 0:
            missing.append(["seed", px, py]); continue
        m = lab2 == k
        if m.sum() > 400:
            missing.append(["seed-too-big", px, py, int(m.sum())]); continue
        bg |= ndi.binary_dilation(m, iterations=2) & soft
        used.append(["seed", px, py, int(m.sum())])

    # 細い切れ端
    distbg = ndi.distance_transform_edt(~bg)
    rest = soft & ~bg
    lab3, n3 = ndi.label(rest)
    if n3:
        idx = np.arange(1, n3 + 1)
        dt = ndi.distance_transform_edt(rest)
        area = ndi.sum(np.ones_like(d), lab3, idx)
        ok = idx[(area < 150) & (ndi.maximum(dt, lab3, idx) <= 1.5) & (ndi.minimum(distbg, lab3, idx) <= 6)]
        bg |= np.isin(lab3, ok)

    alpha = np.where(bg, 0.0, 1.0)
    near = ndi.binary_dilation(bg, iterations=BAND) & ~bg
    ramp = np.clip((d - T_LO) / (T_HI - T_LO), 0, 1)
    lmax = ndi.maximum_filter(d, size=5)
    ratio = np.where(lmax >= 96, np.clip(1.15 * d / np.maximum(lmax, 1), 0, 1), 1.0)
    alpha = np.where(near, np.minimum(ramp, ratio), alpha)
    a3 = alpha[..., None]
    C = np.clip(np.where(a3 > 0.02, (im - (1 - a3) * B) / np.maximum(a3, 1e-3), im), 0, 255)
    Image.fromarray(np.dstack([C, alpha * 255]).round().astype(np.uint8), "RGBA").save(dst, optimize=True)
    return {"dst": dst.split("/")[-1], "bg": B.tolist() if bgmode == "flat" else [B[0, 0].tolist(), B[-1, 0].tolist()], "transparent": round(float((alpha == 0).mean()), 3), "holes": used, "missing": missing}


if __name__ == "__main__":
    conf = json.load(open(sys.argv[1], encoding="utf-8"))
    seeds = conf.pop("_seeds", {})
    bgmodes = conf.pop("_bgmode", {})
    pairs = sys.argv[2:]
    bad = 0
    for src, dst in zip(pairs[0::2], pairs[1::2]):
        key = dst.split("/")[-1][:-4]
        r = cutout(src, dst, conf.get(key, []), seeds.get(key, []), bgmodes.get(key, "flat"))
        bad += len(r["missing"])
        print(json.dumps(r, ensure_ascii=False))
    sys.exit(1 if bad else 0)
