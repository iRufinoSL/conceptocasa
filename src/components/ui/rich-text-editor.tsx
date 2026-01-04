import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Button } from '@/components/ui/button';
import { 
  Bold, 
  Italic, 
  Underline as UnderlineIcon, 
  List, 
  ListOrdered,
  Palette,
  Heading1,
  Heading2,
  Heading3,
  AlignLeft,
  Undo,
  Redo
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  fullScreen?: boolean;
}

const COLORS = [
  '#000000', '#374151', '#6B7280', '#9CA3AF',
  '#DC2626', '#EA580C', '#D97706', '#CA8A04',
  '#16A34A', '#059669', '#0D9488', '#0891B2',
  '#2563EB', '#4F46E5', '#7C3AED', '#9333EA',
  '#DB2777', '#E11D48'
];

export function RichTextEditor({ 
  value, 
  onChange, 
  placeholder = 'Escribe aquí...', 
  className,
  minHeight = '120px',
  fullScreen = false
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: {
          keepMarks: true,
          keepAttributes: false,
        },
        orderedList: {
          keepMarks: true,
          keepAttributes: false,
        },
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Underline,
      TextStyle,
      Color,
    ],
    content: value || '',
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm max-w-none focus:outline-none',
          'p-4',
          '[&_ul]:list-disc [&_ul]:ml-6 [&_ul]:my-2',
          '[&_ol]:list-decimal [&_ol]:ml-6 [&_ol]:my-2',
          '[&_li]:my-1',
          '[&_p]:my-2 [&_p]:leading-relaxed',
          '[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:my-4',
          '[&_h2]:text-xl [&_h2]:font-semibold [&_h2]:my-3',
          '[&_h3]:text-lg [&_h3]:font-medium [&_h3]:my-2',
          fullScreen ? 'min-h-[calc(100vh-200px)]' : ''
        ),
        style: fullScreen ? undefined : `min-height: ${minHeight}`,
      },
    },
  });

  // Update editor content when value prop changes from external source
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || '');
    }
  }, [value, editor]);

  if (!editor) {
    return null;
  }

  const ToolbarButton = ({ 
    onClick, 
    isActive = false, 
    title, 
    children 
  }: { 
    onClick: () => void; 
    isActive?: boolean; 
    title: string; 
    children: React.ReactNode;
  }) => (
    <Button
      type="button"
      variant={isActive ? 'secondary' : 'ghost'}
      size="icon"
      className={cn(
        "h-8 w-8",
        fullScreen && "h-9 w-9"
      )}
      onClick={onClick}
      title={title}
    >
      {children}
    </Button>
  );

  const iconSize = fullScreen ? "h-4 w-4" : "h-3.5 w-3.5";

  return (
    <div className={cn(
      'border rounded-md overflow-hidden bg-background flex flex-col',
      fullScreen && 'h-full',
      className
    )}>
      {/* Toolbar - Sticky */}
      <div className={cn(
        "flex items-center gap-1 p-2 border-b bg-muted/50 flex-wrap sticky top-0 z-10",
        fullScreen && "p-3 gap-2"
      )}>
        {/* Undo/Redo */}
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          title="Deshacer"
        >
          <Undo className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          title="Rehacer"
        >
          <Redo className={iconSize} />
        </ToolbarButton>

        <div className="w-px h-6 bg-border mx-1" />

        {/* Headings */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          isActive={editor.isActive('heading', { level: 1 })}
          title="Título 1"
        >
          <Heading1 className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive('heading', { level: 2 })}
          title="Título 2"
        >
          <Heading2 className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          isActive={editor.isActive('heading', { level: 3 })}
          title="Título 3"
        >
          <Heading3 className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setParagraph().run()}
          isActive={editor.isActive('paragraph')}
          title="Párrafo"
        >
          <AlignLeft className={iconSize} />
        </ToolbarButton>

        <div className="w-px h-6 bg-border mx-1" />

        {/* Text formatting */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive('bold')}
          title="Negrita (Ctrl+B)"
        >
          <Bold className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive('italic')}
          title="Cursiva (Ctrl+I)"
        >
          <Italic className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          isActive={editor.isActive('underline')}
          title="Subrayado (Ctrl+U)"
        >
          <UnderlineIcon className={iconSize} />
        </ToolbarButton>
        
        <div className="w-px h-6 bg-border mx-1" />
        
        {/* Lists */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive('bulletList')}
          title="Lista con viñetas"
        >
          <List className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive('orderedList')}
          title="Lista numerada"
        >
          <ListOrdered className={iconSize} />
        </ToolbarButton>
        
        <div className="w-px h-6 bg-border mx-1" />
        
        {/* Color picker */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8",
                fullScreen && "h-9 w-9"
              )}
              title="Color de texto"
            >
              <Palette className={iconSize} />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3" align="start">
            <div className="grid grid-cols-6 gap-1.5">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className="h-7 w-7 rounded border border-border hover:scale-110 transition-transform"
                  style={{ backgroundColor: color }}
                  onClick={() => editor.chain().focus().setColor(color).run()}
                  title={color}
                />
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full mt-3 text-xs"
              onClick={() => editor.chain().focus().unsetColor().run()}
            >
              Quitar color
            </Button>
          </PopoverContent>
        </Popover>
      </div>
      
      {/* Editor with scroll */}
      {fullScreen ? (
        <ScrollArea className="flex-1">
          <div className="relative">
            <EditorContent 
              editor={editor} 
              className="[&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[calc(100vh-200px)]"
            />
            {/* Placeholder */}
            {editor.isEmpty && !editor.isFocused && (
              <div className="absolute top-4 left-4 text-muted-foreground pointer-events-none">
                {placeholder}
              </div>
            )}
          </div>
        </ScrollArea>
      ) : (
        <div className="relative overflow-auto" style={{ maxHeight: '400px' }}>
          <EditorContent 
            editor={editor} 
            className="[&_.ProseMirror]:outline-none"
          />
          {/* Placeholder */}
          {editor.isEmpty && !editor.isFocused && (
            <div className="absolute top-4 left-4 text-muted-foreground pointer-events-none text-sm">
              {placeholder}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
