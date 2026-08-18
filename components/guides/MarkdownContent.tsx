import ReactMarkdown from "react-markdown";
import { getYouTubeEmbedUrl } from "../../lib/youtube";

interface MarkdownContentProps {
  content: string;
}

type GuideContentBlock =
  | { type: "markdown"; content: string }
  | { type: "youtube"; embedUrl: string };

function splitGuideContent(content: string): GuideContentBlock[] {
  const blocks: GuideContentBlock[] = [];
  const markdownLines: string[] = [];
  let fenceCharacter: "`" | "~" | null = null;

  function flushMarkdown() {
    if (markdownLines.length === 0) {
      return;
    }

    const markdown = markdownLines.join("\n");

    if (markdown.trim()) {
      blocks.push({ type: "markdown", content: markdown });
    }

    markdownLines.length = 0;
  }

  for (const line of content.split("\n")) {
    const candidate = line.trim();
    const fenceMatch = candidate.match(/^(```+|~~~+)/);
    const isFenceLine = Boolean(fenceMatch);
    const embedUrl = !fenceCharacter && !isFenceLine && candidate
      ? getYouTubeEmbedUrl(candidate)
      : null;

    if (embedUrl) {
      flushMarkdown();
      blocks.push({ type: "youtube", embedUrl });
      continue;
    }

    markdownLines.push(line);

    if (fenceMatch) {
      const character = fenceMatch[1][0] as "`" | "~";

      if (!fenceCharacter) {
        fenceCharacter = character;
      } else if (fenceCharacter === character) {
        fenceCharacter = null;
      }
    }
  }

  flushMarkdown();
  return blocks;
}

export default function MarkdownContent({ content }: MarkdownContentProps) {
  const blocks = splitGuideContent(content);

  return (
    <div className="guide-markdown">
      {blocks.map((block, index) =>
        block.type === "youtube" ? (
          <div className="guide-youtube" key={`youtube-${index}`}>
            <iframe
              src={block.embedUrl}
              title="YouTube video player"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
        ) : (
          <ReactMarkdown key={`markdown-${index}`}>{block.content}</ReactMarkdown>
        ),
      )}

      <style jsx global>{`
        .guide-markdown {
          padding: 28px;
          color: #c9d1d9;
          font-size: 1rem;
          line-height: 1.75;
        }

        .guide-markdown > :first-child {
          margin-top: 0;
        }

        .guide-markdown > :last-child {
          margin-bottom: 0;
        }

        .guide-markdown h2,
        .guide-markdown h3,
        .guide-markdown h4 {
          margin: 1.8em 0 0.65em;
          color: #f0f6fc;
          line-height: 1.25;
        }

        .guide-markdown p,
        .guide-markdown ul,
        .guide-markdown ol,
        .guide-markdown blockquote,
        .guide-markdown pre {
          margin: 0 0 1.15em;
        }

        .guide-markdown ul,
        .guide-markdown ol {
          padding-left: 1.5rem;
        }

        .guide-markdown li + li {
          margin-top: 0.35rem;
        }

        .guide-markdown a {
          color: #58a6ff;
        }

        .guide-markdown code {
          padding: 0.15em 0.35em;
          border-radius: 4px;
          background: #0d1117;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
            "Liberation Mono", monospace;
          font-size: 0.9em;
        }

        .guide-markdown pre {
          overflow-x: auto;
          padding: 16px;
          border: 1px solid #30363d;
          border-radius: 8px;
          background: #0d1117;
        }

        .guide-markdown pre code {
          padding: 0;
          background: transparent;
        }

        .guide-markdown blockquote {
          padding-left: 16px;
          border-left: 4px solid #238636;
          color: #8b949e;
        }

        .guide-markdown hr {
          margin: 2rem 0;
          border: 0;
          border-top: 1px solid #30363d;
        }

        .guide-markdown img {
          max-width: 100%;
          height: auto;
          border-radius: 8px;
        }

        .guide-youtube {
          width: 100%;
          max-width: 960px;
          aspect-ratio: 16 / 9;
          margin: 1.5rem auto;
          overflow: hidden;
          border-radius: 10px;
          background: #000;
        }

        .guide-youtube iframe {
          display: block;
          width: 100%;
          height: 100%;
          border: 0;
        }

        @media (max-width: 600px) {
          .guide-markdown {
            padding: 22px;
          }

          .guide-youtube {
            border-radius: 8px;
          }
        }
      `}</style>
    </div>
  );
}
