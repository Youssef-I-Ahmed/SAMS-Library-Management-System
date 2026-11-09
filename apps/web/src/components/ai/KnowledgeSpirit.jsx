const poses = {
  greeting: {
    eyes: 'M92 108q8-12 16 0m25 0q8-12 16 0',
    mouth: 'M113 118q7 9 14 0',
    signal: 'M-15 5q5-9 10 0t10 0t10 0M-9-8l-3-4M0-9v-5M9-8l3-4'
  },
  idle: {
    eyes: 'M100 100v10m41-10v10',
    mouth: 'M116 119h9',
    signal: 'M-9-13H9v26l-9-6-9 6z'
  },
  searching: {
    eyes: 'M106 102v10m41-10v10',
    mouth: 'M119 120h8',
    signal: 'M5-4a9 9 0 1 1-18 0 9 9 0 1 1 18 0ZM3 3l11 11'
  },
  thinking: {
    eyes: 'M91 107q9 5 18-1m30-8v11M132 91l13-3',
    mouth: 'M114 120q6-4 11 0',
    signal: 'M-12 0h1M0 0h1m11 0h1'
  },
  success: {
    eyes: 'M92 109q7-12 15 0m27 0q7-12 15 0',
    mouth: 'M109 116q11 17 22 0z',
    signal: 'M-13 0l9 9 17-19'
  },
  'no-results': {
    eyes: 'M92 107q9 8 17 4m23 0q8 4 17-4',
    mouth: 'M113 123q7-7 14 0',
    signal: 'M-12 0h24'
  },
  error: {
    eyes: 'M100 99v14m41-14v14M94 94l10-5m33 0 10 5',
    mouth: 'M125 120a5 5 0 1 1-10 0 5 5 0 1 1 10 0z',
    signal: 'M0-15l16 28h-32zM0-5v7m0 5h.1'
  }
};

export function KnowledgeSpirit({ state = 'idle' }) {
  const pose = poses[state] ?? poses.idle;
  return (
    <div className="knowledge-spirit" data-spirit-state={state} aria-hidden="true">
      <svg viewBox="0 0 240 270" focusable="false">
        <g className="knowledge-spirit__body">
          <path className="spirit-cloak" d="M91 139Q51 154 47 187L81 180 66 211Q105 200 119 218Q145 202 176 209L164 180 194 186Q190 153 148 138Z" />
          <path className="spirit-trim" d="M91 145 116 198 149 145M74 174Q52 180 49 187M167 174 191 185" />
          <path className="spirit-hair" d="M69 99Q60 63 91 56L150 57Q180 69 170 112L181 105Q176 135 152 135L89 137Q66 134 61 119L70 119Z" />
          <path className="spirit-face" d="M78 97Q83 77 119 78Q157 77 162 100Q163 132 121 137Q79 135 78 97Z" />
          <path className="spirit-eyes" d={pose.eyes} />
          <path className="spirit-mouth" d={pose.mouth} />
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
          <path className="spirit-bookmark" d="m150 211 8-4v15l-4-2-4 5z" />
        </g>
        <g transform="translate(204 129)">
          <g className="spirit-signal">
            <circle r="24" />
            <path d={pose.signal} />
          </g>
        </g>
      </svg>
    </div>
  );
}
