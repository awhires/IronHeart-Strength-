from PIL import Image, ImageChops
from pypdf import PdfReader, PdfWriter, Transformation
from pathlib import Path

preview=Image.open('tmp/pdfs/logo.png').convert('L')
mask=preview.point(lambda p: 255 if p < 100 else 0)
left,top,right,bottom=mask.getbbox()
page=PdfReader(r'C:/Users/austi/Downloads/IH mini logo.pdf').pages[0]
page.transfer_rotation_to_content()
w,h=float(page.mediabox.width),float(page.mediabox.height)
x0,x1=left*w/preview.width,right*w/preview.width
y0,y1=h-bottom*h/preview.height,h-top*h/preview.height
scale=400/(y1-y0)
dx=(512-(x1-x0)*scale)/2-x0*scale
dy=(512-(y1-y0)*scale)/2-y0*scale
writer=PdfWriter()
output=writer.add_blank_page(width=512,height=512)
output.merge_transformed_page(page,Transformation().scale(scale).translate(dx,dy))
Path('output/pdf').mkdir(parents=True,exist_ok=True)
with open('output/pdf/Iron-Heart-Logo-Centered.pdf','wb') as f: writer.write(f)
print('Centered original artwork with equal margins on a square page.')
