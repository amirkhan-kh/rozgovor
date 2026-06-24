#!/usr/bin/env bash
# Adds name + "+1 SOTUV" text overlays and music onto generated celebration
# videos. Source videos are text-free Veo 3 clips. This step produces the
# playable -final.mp4 files shown in TV mode.
#
# Usage:
#   bash scripts/mix-celebration-audio.sh <slug> <managerName> [audioSrc] [startSec] [durationSec]
# Example:
#   bash scripts/mix-celebration-audio.sh bexruz_urazboyev "Bexruz Urazboyev"

set -euo pipefail

SLUG="${1:?slug required}"
MANAGER_NAME="${2:?manager name required}"
PROJECT_ROOT="/home/grafeas/WORK/Agents/SalesAi | Bitrix | Prosales"
AUDIO_SRC="${3:-$PROJECT_ROOT/audio/yt_0iC10hKsi20.mp3}"
START_SEC="${4:-56}"
DUR_SEC="${5:-8}"

FONT="/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf"
VIDEO_DIR="$PROJECT_ROOT/video-test/output/$SLUG"
CLIP="$VIDEO_DIR/_audio-clip.m4a"

NAME_UPPER="$(echo "$MANAGER_NAME" | tr '[:lower:]' '[:upper:]')"

if [[ ! -d "$VIDEO_DIR" ]]; then
  echo "video dir not found: $VIDEO_DIR" >&2
  exit 1
fi

if [[ ! -f "$FONT" ]]; then
  echo "font not found: $FONT" >&2
  exit 1
fi

echo ">> cutting audio ${START_SEC}..+${DUR_SEC}s from $(basename "$AUDIO_SRC")"
ffmpeg -y -hide_banner -loglevel error \
  -ss "$START_SEC" -t "$DUR_SEC" -i "$AUDIO_SRC" \
  -c:a aac -b:a 192k "$CLIP"

# drawtext animation plan (per clip; t=0 is start):
#   name       fades in  0.8s..1.2s, stays until end
#   "+1"       fades in  2.0s..2.4s, stays until end
#   "SOTUV"    fades in  2.0s..2.4s, stays until end
NAME_ALPHA="if(lt(t,0.8),0,if(lt(t,1.2),(t-0.8)/0.4,1))"
TAG_ALPHA="if(lt(t,2),0,if(lt(t,2.4),(t-2)/0.4,1))"

shopt -s nullglob
for SRC in "$VIDEO_DIR"/v*.mp4; do
  BASE="$(basename "$SRC" .mp4)"
  if [[ "$BASE" == *-final ]]; then continue; fi
  OUT="$VIDEO_DIR/${BASE}-final.mp4"
  echo ">> mixing + text overlay -> $(basename "$OUT")"

  ffmpeg -y -hide_banner -loglevel error \
    -i "$SRC" -i "$CLIP" \
    -filter_complex "\
[0:v]drawtext=fontfile='$FONT':text='$NAME_UPPER':fontcolor=white:fontsize=42:x=80:y=h-130:shadowcolor=black@0.7:shadowx=2:shadowy=2:alpha='$NAME_ALPHA'[v1];\
[v1]drawtext=fontfile='$FONT':text='+1':fontcolor=white:fontsize=180:x=w-320:y=h/2-220:shadowcolor=black@0.7:shadowx=3:shadowy=3:alpha='$TAG_ALPHA'[v2];\
[v2]drawtext=fontfile='$FONT':text='SOTUV':fontcolor=white:fontsize=92:x=w-370:y=h/2+0:shadowcolor=black@0.7:shadowx=3:shadowy=3:alpha='$TAG_ALPHA'[out]" \
    -map "[out]" -map 1:a \
    -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p \
    -c:a aac -b:a 192k -shortest "$OUT"
done

rm -f "$CLIP"
echo ">> done. Finished files: $VIDEO_DIR/v*-final.mp4"
