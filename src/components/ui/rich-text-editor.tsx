import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  AlignCenter,
  AlignRight,
  AlignJustify,
  Undo,
  Redo,
  Quote,
  Minus,
  Highlighter,
  Link as LinkIcon,
  Unlink,
  Strikethrough,
  RemoveFormatting,
  WrapText,
  Pilcrow
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useEffect, useState, useCallback } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  fullScreen?: boolean;
}

const TEXT_COLORS = [
  '#000000', '#374151', '#6B7280', '#9CA3AF', '#F9FAFB',
  '#DC2626', '#EA580C', '#D97706', '#CA8A04', '#84CC16',
  '#16A34A', '#059669', '#0D9488', '#0891B2', '#0284C7',
  '#2563EB', '#4F46E5', '#7C3AED', '#9333EA', '#C026D3',
  '#DB2777', '#E11D48'
];

const HIGHLIGHT_COLORS = [
  '#FEF08A', '#FDE047', '#FACC15', 
  '#BBF7D0', '#86EFAC', '#4ADE80',
  '#A5F3FC', '#67E8F9', '#22D3EE',
  '#FECACA', '#FCA5A5', '#F87171',
  '#E9D5FF', '#D8B4FE', '#C084FC',
  '#FED7AA', '#FDBA74', '#FB923C'
];

export function RichTextEditor({ 
  value, 
  onChange, 
  placeholder = 'Escribe aquí...', 
  className,
  minHeight = '120px',
  fullScreen = false
}: RichTextEditorProps) {
  const [linkUrl, setLinkUrl] = useState('');
  const [isLinkPopoverOpen, setIsLinkPopoverOpen] = useState(false);

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
        blockquote: {
          HTMLAttributes: {
            class: 'border-l-4 border-muted-foreground/30 pl-4 italic my-4',
          },
        },
        horizontalRule: {
          HTMLAttributes: {
            class: 'my-6 border-t border-border',
          },
        },
        hardBreak: {
          keepMarks: true,
        },
      }),
      Underline,
      TextStyle,
      Color,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
        alignments: ['left', 'center', 'right', 'justify'],
      }),
      Highlight.configure({
        multicolor: true,
        HTMLAttributes: {
          class: 'rounded px-1',
        },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          class: 'text-primary underline cursor-pointer hover:text-primary/80',
        },
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'is-editor-empty',
      }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm max-w-none focus:outline-none dark:prose-invert',
          'px-6 py-4',
          '[&_ul]:list-disc [&_ul]:ml-6 [&_ul]:my-3',
          '[&_ol]:list-decimal [&_ol]:ml-6 [&_ol]:my-3',
          '[&_li]:my-1.5 [&_li]:leading-relaxed',
          '[&_p]:my-3 [&_p]:leading-7',
          '[&_p:empty]:h-6',
          '[&_h1]:text-3xl [&_h1]:font-bold [&_h1]:my-5 [&_h1]:leading-tight',
          '[&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:my-4 [&_h2]:leading-tight',
          '[&_h3]:text-xl [&_h3]:font-medium [&_h3]:my-3 [&_h3]:leading-tight',
          '[&_blockquote]:border-l-4 [&_blockquote]:border-muted-foreground/30 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:my-4',
          '[&_hr]:my-6 [&_hr]:border-border',
          '[&_a]:text-primary [&_a]:underline [&_a]:cursor-pointer',
          '[&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.is-editor-empty:first-child::before]:text-muted-foreground [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:h-0 [&_.is-editor-empty:first-child::before]:pointer-events-none',
          fullScreen ? 'min-h-[calc(100vh-180px)]' : ''
        ),
        style: fullScreen ? undefined : `min-height: ${minHeight}`,
      },
    },
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || '');
    }
  }, [value, editor]);

  const setLink = useCallback(() => {
    if (!editor) return;
    
    if (linkUrl === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    const url = linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`;
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    setLinkUrl('');
    setIsLinkPopoverOpen(false);
  }, [editor, linkUrl]);

  const openLinkPopover = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href || '';
    setLinkUrl(previousUrl);
    setIsLinkPopoverOpen(true);
  }, [editor]);

  if (!editor) {
    return null;
  }

  const ToolbarButton = ({ 
    onClick, 
    isActive = false, 
    disabled = false,
    title, 
    children 
  }: { 
    onClick: () => void; 
    isActive?: boolean;
    disabled?: boolean;
    title: string; 
    children: React.ReactNode;
  }) => (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant={isActive ? 'secondary' : 'ghost'}
            size="icon"
            disabled={disabled}
            className={cn(
              "h-8 w-8 shrink-0",
              fullScreen && "h-9 w-9",
              isActive && "bg-secondary"
            )}
            onClick={onClick}
          >
            {children}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {title}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  const ToolbarSeparator = () => (
    <Separator orientation="vertical" className="h-6 mx-1" />
  );

  const iconSize = fullScreen ? "h-4 w-4" : "h-3.5 w-3.5";

  return (
    <div className={cn(
      'border rounded-lg overflow-hidden bg-background flex flex-col',
      fullScreen && 'h-full',
      className
    )}>
      {/* Toolbar */}
      <div className={cn(
        "flex items-center gap-0.5 p-2 border-b bg-muted/30 flex-wrap sticky top-0 z-10",
        fullScreen && "p-3 gap-1"
      )}>
        {/* Undo/Redo */}
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Deshacer (Ctrl+Z)"
        >
          <Undo className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Rehacer (Ctrl+Y)"
        >
          <Redo className={iconSize} />
        </ToolbarButton>

        <ToolbarSeparator />

        {/* Headings & Paragraph */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          isActive={editor.isActive('heading', { level: 1 })}
          title="Título 1 (Ctrl+Alt+1)"
        >
          <Heading1 className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive('heading', { level: 2 })}
          title="Título 2 (Ctrl+Alt+2)"
        >
          <Heading2 className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          isActive={editor.isActive('heading', { level: 3 })}
          title="Título 3 (Ctrl+Alt+3)"
        >
          <Heading3 className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setParagraph().run()}
          isActive={editor.isActive('paragraph') && !editor.isActive('heading')}
          title="Párrafo normal"
        >
          <Pilcrow className={iconSize} />
        </ToolbarButton>

        <ToolbarSeparator />

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
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          isActive={editor.isActive('strike')}
          title="Tachado"
        >
          <Strikethrough className={iconSize} />
        </ToolbarButton>

        <ToolbarSeparator />

        {/* Alignment */}
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          isActive={editor.isActive({ textAlign: 'left' })}
          title="Alinear a la izquierda"
        >
          <AlignLeft className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          isActive={editor.isActive({ textAlign: 'center' })}
          title="Centrar"
        >
          <AlignCenter className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          isActive={editor.isActive({ textAlign: 'right' })}
          title="Alinear a la derecha"
        >
          <AlignRight className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
          isActive={editor.isActive({ textAlign: 'justify' })}
          title="Justificar"
        >
          <AlignJustify className={iconSize} />
        </ToolbarButton>
        
        <ToolbarSeparator />
        
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

        <ToolbarSeparator />

        {/* Block elements */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          isActive={editor.isActive('blockquote')}
          title="Cita"
        >
          <Quote className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Línea horizontal"
        >
          <Minus className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setHardBreak().run()}
          title="Salto de línea (Shift+Enter)"
        >
          <WrapText className={iconSize} />
        </ToolbarButton>
        
        <ToolbarSeparator />

        {/* Links */}
        <Popover open={isLinkPopoverOpen} onOpenChange={setIsLinkPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant={editor.isActive('link') ? 'secondary' : 'ghost'}
              size="icon"
              className={cn(
                "h-8 w-8 shrink-0",
                fullScreen && "h-9 w-9"
              )}
              onClick={openLinkPopover}
              title="Insertar enlace"
            >
              <LinkIcon className={iconSize} />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-3" align="start">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">URL del enlace</label>
              <Input
                type="url"
                placeholder="https://ejemplo.com"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    setLink();
                  }
                }}
              />
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={setLink} className="flex-1">
                  Aplicar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsLinkPopoverOpen(false)}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        {editor.isActive('link') && (
          <ToolbarButton
            onClick={() => editor.chain().focus().unsetLink().run()}
            title="Quitar enlace"
          >
            <Unlink className={iconSize} />
          </ToolbarButton>
        )}

        <ToolbarSeparator />
        
        {/* Colors & Highlight */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 shrink-0",
                fullScreen && "h-9 w-9"
              )}
              title="Color de texto"
            >
              <Palette className={iconSize} />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3" align="start">
            <p className="text-xs font-medium mb-2 text-muted-foreground">Color de texto</p>
            <div className="grid grid-cols-6 gap-1.5">
              {TEXT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className="h-6 w-6 rounded border border-border hover:scale-110 transition-transform"
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
              className="w-full mt-2 text-xs"
              onClick={() => editor.chain().focus().unsetColor().run()}
            >
              Quitar color
            </Button>
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant={editor.isActive('highlight') ? 'secondary' : 'ghost'}
              size="icon"
              className={cn(
                "h-8 w-8 shrink-0",
                fullScreen && "h-9 w-9"
              )}
              title="Resaltar texto"
            >
              <Highlighter className={iconSize} />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3" align="start">
            <p className="text-xs font-medium mb-2 text-muted-foreground">Color de resaltado</p>
            <div className="grid grid-cols-6 gap-1.5">
              {HIGHLIGHT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className="h-6 w-6 rounded border border-border hover:scale-110 transition-transform"
                  style={{ backgroundColor: color }}
                  onClick={() => editor.chain().focus().toggleHighlight({ color }).run()}
                  title={color}
                />
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full mt-2 text-xs"
              onClick={() => editor.chain().focus().unsetHighlight().run()}
            >
              Quitar resaltado
            </Button>
          </PopoverContent>
        </Popover>

        <ToolbarSeparator />

        {/* Clear formatting */}
        <ToolbarButton
          onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
          title="Limpiar formato"
        >
          <RemoveFormatting className={iconSize} />
        </ToolbarButton>
      </div>
      
      {/* Editor content */}
      {fullScreen ? (
        <ScrollArea className="flex-1">
          <EditorContent 
            editor={editor} 
            className="[&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[calc(100vh-180px)]"
          />
        </ScrollArea>
      ) : (
        <div className="overflow-auto" style={{ maxHeight: '500px' }}>
          <EditorContent 
            editor={editor} 
            className="[&_.ProseMirror]:outline-none"
          />
        </div>
      )}

      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t bg-muted/20 text-xs text-muted-foreground">
        <span>
          {editor.storage.characterCount?.characters?.() ?? 0} caracteres
        </span>
        <span>
          Presiona Enter para nuevo párrafo • Shift+Enter para salto de línea
        </span>
      </div>
    </div>
  );
}
