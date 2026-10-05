from pathlib import Path
from PIL import Image
from pypdf import PdfReader, PdfWriter, Transformation
import subprocess

preview=Image.open('tmp/pdfs/wordmark.png').convert('L')
left,top,right,bottom=preview.point(lambda p:255 if p<100 else 0).getbbox()
# The final separated ink band is the phone number; retain the wordmark above it.
ink=preview.point(lambda p:255 if p<100 else 0)
bands=[]
for y in range(top,bottom):
    if ink.crop((left,y,right,y+1)).getbbox():
        if not bands or y>bands[-1][-1]+1: bands.append([])
        bands[-1].append(y)
assert len(bands)>=2, 'Cannot isolate the phone number safely'
bottom=bands[-2][-1]+1
page=PdfReader(r'C:/Users/austi/Downloads/IronHeart with #.pdf').pages[0]
page.transfer_rotation_to_content()
w,h=float(page.mediabox.width),float(page.mediabox.height)
x0,x1=left*w/preview.width,right*w/preview.width
y0,y1=h-bottom*h/preview.height,h-top*h/preview.height
writer=PdfWriter()
out=writer.add_blank_page(width=x1-x0+8,height=y1-y0+8)
out.merge_transformed_page(page,Transformation().translate(4-x0,4-y0))
target=Path('tmp/pdfs/wordmark-cropped.pdf')
with target.open('wb') as f: writer.write(f)
subprocess.run(['pdftoppm','-scale-to','1800','-singlefile','-png',str(target),'public/iron-heart-wordmark'],check=True)
print('Imported original wordmark without the phone number, with even margins.')
