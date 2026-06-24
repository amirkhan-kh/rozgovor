import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { PlayCircle, Phone, Clock, CheckCircle, ArrowLeft } from "lucide-react";
import Card from "../../components/ui/Card";
import Skeleton from "../../components/ui/Skeleton";
import { playlistsService } from "../../services/playlists.service";

const PlaylistsPage: React.FC = () => {
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const { data: defs, isLoading: defsLoading } = useQuery({
    queryKey: ["playlist-definitions"],
    queryFn: () => playlistsService.getDefinitions(),
  });

  const { data: items, isLoading: itemsLoading } = useQuery({
    queryKey: ["playlist-items", activeKey],
    queryFn: () => playlistsService.getItems(activeKey!),
    enabled: !!activeKey,
  });

  if (activeKey) {
    const def = defs?.playlists.find((p) => p.key === activeKey);
    return (
      <div className="px-4 md:px-6 py-4 space-y-4 max-w-6xl mx-auto">
        <button
          onClick={() => setActiveKey(null)}
          className="flex items-center gap-1 text-sm text-secondary hover:text-primary"
        >
          <ArrowLeft size={16} /> Barcha playlistlar
        </button>

        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            {def?.emoji} {def?.name}
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            {def?.description}
          </p>
        </div>

        {itemsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : !items?.items || items.items.length === 0 ? (
          <Card>
            <div className="py-12 text-center">
              <PlayCircle size={32} className="mx-auto mb-2 opacity-40" style={{ color: "var(--text-secondary)" }} />
              <p className="text-secondary">Bu playlistda qo'ng'iroqlar yo'q</p>
            </div>
          </Card>
        ) : (
          <div className="space-y-2">
            {items.items.map((item) => (
              <Link
                key={item.audioFileId}
                to={`/audio/${item.audioFileId}`}
                className="block p-3 rounded-lg border hover:shadow-md transition-all"
                style={{ backgroundColor: "var(--color-bg)", borderColor: "var(--color-border)" }}
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Phone size={16} style={{ color: "var(--text-secondary)" }} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                          {item.phoneNumber || "Nomalum"}
                        </span>
                        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                          {item.managerName}
                        </span>
                        {item.isSale && (
                          <CheckCircle size={14} style={{ color: "#2fcc6e" }} />
                        )}
                      </div>
                      <p className="text-xs mt-1 line-clamp-1" style={{ color: "var(--text-secondary)" }}>
                        {item.summary || "Xulosa yo'q"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {item.duration && (
                      <div className="flex items-center gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                        <Clock size={12} />
                        {Math.floor(item.duration / 60)}:{String(item.duration % 60).padStart(2, "0")}
                      </div>
                    )}
                    {item.score !== null && (
                      <span
                        className="text-sm font-bold"
                        style={{
                          color: item.score >= 70 ? "#2fcc6e" : item.score >= 50 ? "#e6a020" : "#e64545",
                        }}
                      >
                        {item.score}%
                      </span>
                    )}
                    {item.topObjection && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: "rgba(230,160,32,0.15)", color: "#e6a020" }}
                      >
                        {item.topObjection}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="px-4 md:px-6 py-4 space-y-4 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
          🎬 Smart Playlists
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          Qo'ng'iroqlar tanlangan kolleksiyalari — o'rganish va coaching uchun
        </p>
      </div>

      {defsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {defs?.playlists.map((p) => (
            <button
              key={p.key}
              onClick={() => setActiveKey(p.key)}
              className="text-left p-4 rounded-xl border hover:shadow-md hover:scale-[1.01] transition-all"
              style={{
                backgroundColor: "var(--color-card-bg)",
                borderColor: "var(--color-border)",
              }}
            >
              <div className="flex items-start gap-3">
                <span className="text-3xl">{p.emoji}</span>
                <div className="flex-1">
                  <h3 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                    {p.name}
                  </h3>
                  <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                    {p.description}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default PlaylistsPage;
