// Code-native Concept C interpretation. No network, effects, timers or progress data.
export function KnowledgeSpirit({ state = 'idle' }) {
  const sad = state === 'error' || state === 'no-results';
  const thinking = state === 'thinking';
  return (
    <div className="knowledge-spirit" data-spirit-state={state} aria-hidden="true">
      <svg viewBox="0 0 240 270" focusable="false">
        <g className="knowledge-spirit__body">
          <path className="spirit-cloak" d="M91 139Q51 154 47 187L81 180 66 211Q105 200 119 218Q145 202 176 209L164 180 194 186Q190 153 148 138Z" />
          <path className="spirit-trim" d="M91 145 116 198 149 145M74 174Q52 180 49 187M167 174 191 185" />
          <path className="spirit-hair" d="M69 99Q60 63 91 56L150 57Q180 69 170 112L181 105Q176 135 152 135L89 137Q66 134 61 119L70 119Z" />
          <path className="spirit-face" d="M78 97Q83 77 119 78Q157 77 162 100Q163 132 121 137Q79 135 78 97Z" />
          <g className="spirit-eyes">
            {thinking ? <path className="spirit-eye-line" d="M92 108q8 7 15 0m27 0q8 7 15 0" />
              : state === 'success' ? <path className="spirit-eye-line" d="M92 109q7-12 15 0m27 0q7-12 15 0" />
                : <><ellipse className="spirit-eye" cx="100" cy={sad ? 111 : 106} rx="7" ry={sad ? 9 : 12} /><ellipse className="spirit-eye" cx="141" cy={sad ? 111 : 106} rx="7" ry={sad ? 9 : 12} /><ellipse className="spirit-eye-light" cx="102" cy="102" rx="2" ry="4" /><ellipse className="spirit-eye-light" cx="143" cy="102" rx="2" ry="4" /></>}
          </g>
          <path className="spirit-cap" d="M77 78 85 44 155 44 168 82Q123 56 77 78Z" />
          <path className="spirit-cap" d="m38 43 83-27 82 27-82 28Z" />
          <path className="spirit-trim" d="m38 43 83 28 82-28M181 50v42" />
          <path className="spirit-gold" d="m181 87-5 18h10Z" />
          <circle className="spirit-gold" cx="120" cy="150" r="6" />
          <path className="spirit-hair" d="m83 151-10 13 15 6 8-13m61-6 10 13-15 6-8-13" />
        </g>
        <g className="knowledge-spirit__book">
          <path className="spirit-cap" d="M40 220q40-9 80 8 42-17 81-8l-9 17q-37-6-72 8-36-14-72-8Z" />
          <path className="spirit-paper" d="M48 204q38-2 72 21 32-23 73-21l-5 21q-35-5-68 13-32-18-67-13Z" />
          <path className="spirit-trim" d="M120 226v12m-59-25q25 2 45 15m28 0q24-15 46-15" />
        </g>
        <path className="spirit-spark" d="m36 129 3 7 7 3-7 3-3 7-3-7-7-3 7-3Zm167 17 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" />
      </svg>
    </div>
  );
}
