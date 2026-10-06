import { useEffect, useRef } from 'react';
import Editor, { type BeforeMount, type Monaco, type OnMount } from '@monaco-editor/react';
import type { editor as MonacoEditorNS, languages as MonacoLanguagesNS } from 'monaco-editor';
import { usePineStore } from '../../stores/pineStore';
import { BUILTINS } from '../../services/pine/builtins';

const PINE_LANGUAGE_ID = 'pine';

// Top-level names a script can reference bare (namespaces + non-namespaced builtins).
const KEYWORDS = Array.from(new Set(Object.keys(BUILTINS).map((name) => name.split('.')[0])));

function registerPineLanguage(monaco: Monaco) {
  const languages: MonacoLanguagesNS.ILanguageExtensionPoint[] = monaco.languages.getLanguages();
  if (languages.some((lang) => lang.id === PINE_LANGUAGE_ID)) return;

  monaco.languages.register({ id: PINE_LANGUAGE_ID });
  monaco.languages.setMonarchTokensProvider(PINE_LANGUAGE_ID, {
    keywords: KEYWORDS,
    tokenizer: {
      root: [
        [/\/\/.*$/, 'comment'],
        [/"([^"\\]|\\.)*"/, 'string'],
        [/'([^'\\]|\\.)*'/, 'string'],
        [/\d+(\.\d+)?/, 'number'],
        [/[a-zA-Z_]\w*/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }],
      ],
    },
  });
}

export function MonacoPineEditor() {
  const source = usePineStore((s) => s.source);
  const setSource = usePineStore((s) => s.setSource);
  const errors = usePineStore((s) => s.errors);

  const editorRef = useRef<MonacoEditorNS.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);

  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;
    applyMarkers(monacoRef.current, editorRef.current, errors);
  }, [errors]);

  const handleMount: OnMount = (editorInstance, monaco) => {
    editorRef.current = editorInstance;
    monacoRef.current = monaco;
    applyMarkers(monaco, editorInstance, errors);
  };

  const handleBeforeMount: BeforeMount = (monaco) => {
    registerPineLanguage(monaco);
  };

  return (
    <Editor
      height="100%"
      language={PINE_LANGUAGE_ID}
      theme="vs-dark"
      value={source}
      onChange={(value) => setSource(value ?? '')}
      beforeMount={handleBeforeMount}
      onMount={handleMount}
      options={{
        fontSize: 13,
        fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace",
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        automaticLayout: true,
      }}
    />
  );
}

function applyMarkers(
  monaco: Monaco,
  editorInstance: MonacoEditorNS.IStandaloneCodeEditor,
  errors: { message: string; line?: number; col?: number }[],
) {
  const model = editorInstance.getModel();
  if (!model) return;
  monaco.editor.setModelMarkers(
    model,
    'pine',
    errors.map((e) => ({
      startLineNumber: e.line ?? 1,
      startColumn: e.col ?? 1,
      endLineNumber: e.line ?? 1,
      endColumn: (e.col ?? 1) + 1,
      message: e.message,
      severity: monaco.MarkerSeverity.Error,
    })),
  );
}
