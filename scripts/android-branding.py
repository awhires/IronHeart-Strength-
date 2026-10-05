from pypdf import PdfReader, PdfWriter, Transformation
from pathlib import Path
import subprocess

# Re-render the original PDF artwork at Android density sizes. No redraw or
# bitmap alteration; a larger PDF canvas provides adaptive-icon safe margins.
page=PdfReader('output/pdf/Iron-Heart-Logo-Centered.pdf').pages[0]
writer=PdfWriter()
canvas=writer.add_blank_page(width=768,height=768)
canvas.merge_transformed_page(page,Transformation().translate(128,128))
tmp=Path('tmp/pdfs/android-icon.pdf')
with tmp.open('wb') as f: writer.write(f)
res=Path('android/app/src/main/res')
for density,size,foreground in [('mdpi',48,108),('hdpi',72,162),('xhdpi',96,216),('xxhdpi',144,324),('xxxhdpi',192,432)]:
    folder=res/f'mipmap-{density}'
    folder.mkdir(parents=True,exist_ok=True)
    for name in ['ic_launcher','ic_launcher_round']:
        subprocess.run(['pdftoppm','-scale-to',str(size),'-singlefile','-png','output/pdf/Iron-Heart-Logo-Centered.pdf',str(folder/name)],check=True)
    subprocess.run(['pdftoppm','-scale-to',str(foreground),'-singlefile','-png',str(tmp),str(folder/'ic_launcher_foreground')],check=True)
(res/'values/ic_launcher_background.xml').write_text('<?xml version="1.0" encoding="utf-8"?><resources><color name="ic_launcher_background">#FFFFFF</color></resources>')
for f in res.glob('drawable*/splash.png'):
    subprocess.run(['pdftoppm','-scale-to','512','-singlefile','-png',str(tmp),str(f.with_suffix(''))],check=True)
print('Generated centered launcher and splash artwork for all Android densities.')
