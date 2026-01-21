import xml.etree.ElementTree as ET
import html

# Parse the XML file
tree = ET.parse(r'c:\Projects\Cancer Canadian Project\output\Find cancer early\_Local\Phone Message\{6F8D1E10-EB67-4103-947E-3DE923658237}\en\1\xml')
root = tree.getroot()

# Extract all content from <content> tags
content_list = []
for content_tag in root.findall('.//content'):
    if content_tag.text:
        # Decode HTML entities
        decoded_content = html.unescape(content_tag.text)
        content_list.append(decoded_content)

# Write to data.txt
with open(r'c:\Projects\Cancer Canadian Project\data.txt', 'w', encoding='utf-8') as f:
    for content in content_list:
        f.write(content + '\n\n')

print(f"Extracted {len(content_list)} content blocks to data.txt")