import { usePineStore } from '../../stores/pineStore';
import { MonacoPineEditor } from './MonacoPineEditor';

interface PineEditorPanelProps {
  open: boolean;
  onClose: () => void;
}

export function PineEditorPanel({ open, onClose }: PineEditorPanelProps) {
  const errors = usePineStore((s) => s.errors);
  const parsedResult = usePineStore((s) => s.parsedResult);

  if (!open) return null;

  return (
    <div className="pine-editor-panel">
      <div className="pine-editor-header">
        <span>Pine Editor</span>
        {parsedResult?.title && <span className="pine-editor-title">{parsedResult.title}</span>}
        <button className="pine-editor-close" onClick={onClose} title="Close editor">
          ✕
        </button>
      </div>
      <div className="pine-editor-body">
        <MonacoPineEditor />
      </div>
      {errors.length > 0 && (
        <div className="pine-editor-errors">
          {errors.map((err, i) => (
            <div key={i} className="pine-editor-error">
              {err.line !== undefined ? `Line ${err.line}: ` : ''}
              {err.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
