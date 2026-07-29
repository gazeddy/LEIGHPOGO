import ReactMarkdown from "react-markdown";

interface MarkdownContentProps {
  content: string;
}

export default function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <div className="guide-markdown">
      <ReactMarkdown>{content}</ReactMarkdown>

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

        @media (max-width: 600px) {
          .guide-markdown {
            padding: 22px;
          }
        }
      `}</style>
    </div>
  );
}
