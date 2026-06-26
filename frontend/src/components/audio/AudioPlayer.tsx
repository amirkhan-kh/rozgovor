import React from "react";

interface Props {
  src: string;
  className?: string;
}

/** Native audio player — stream URL (auth token query param yoki public). */
const AudioPlayer: React.FC<Props> = ({ src, className = "" }) => (
  <audio
    src={src}
    controls
    preload="metadata"
    className={`w-full ${className}`}
    style={{ height: 40 }}
  />
);

export default AudioPlayer;
