const userService = require("../services/service");
const multer = require("multer");
const fs = require("fs");
const yauzl = require("yauzl");
const AdmZip = require("adm-zip");
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");
const path = require("path");
const { convertPdfToPng } = require("../utils/pdfConverter");

const upload = multer({ dest: "uploads/" });
const pdfUpload = multer({ 
  dest: "uploads/pdfs/",
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

const getUsers = async (req, res, next) => {
  try {
    const users = await userService.getUsers();

    res.status(200).json({
      success: true,
      message: "Users fetched successfully",
      data: users,
    });
  } catch (error) {
    next(error);
  }
};

const uploadZip = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded"
      });
    }

    const outputDir = path.join(process.cwd(), 'output');
    
    // Delete existing output directory contents
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
    fs.mkdirSync(outputDir, { recursive: true });
    
    // Delete existing text files in src directory
    const srcDir = path.join(process.cwd(), 'src');
    const filesToDelete = ['data.txt', 'final.txt', 'href.txt'];
    filesToDelete.forEach(file => {
      const filePath = path.join(srcDir, file);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });

    let folderCount = 0;
    let xmlFileCount = 0;
    const extractedFiles = [];
    
    yauzl.open(req.file.path, { lazyEntries: true }, (err, zipfile) => {
      if (err) return next(err);
      
      zipfile.readEntry();
      
      zipfile.on("entry", (entry) => {
        if (/\/$/.test(entry.fileName)) {
          folderCount++;
          const dirPath = path.join(outputDir, entry.fileName);
          fs.mkdirSync(dirPath, { recursive: true });
          zipfile.readEntry();
        } else {
          const filePath = path.join(outputDir, entry.fileName);
          const fileDir = path.dirname(filePath);
          
          if (!fs.existsSync(fileDir)) {
            fs.mkdirSync(fileDir, { recursive: true });
          }
          
          zipfile.openReadStream(entry, (err, readStream) => {
            if (err) return next(err);
            
            const writeStream = fs.createWriteStream(filePath);
            readStream.pipe(writeStream);
            
            writeStream.on('close', () => {
              if (entry.fileName.toLowerCase().endsWith('.xml') || path.basename(entry.fileName) === 'xml') {
                xmlFileCount++;
                extractedFiles.push(filePath);
              }
              zipfile.readEntry();
            });
          });
        }
      });
      
      zipfile.on("end", async () => {
        fs.unlinkSync(req.file.path);
        
        // Process XML files using workers
        const chunkSize = Math.ceil(xmlFileCount / 4);
        const workers = [];
        
        for (let i = 0; i < xmlFileCount; i += chunkSize) {
          const chunk = extractedFiles.slice(i, i + chunkSize);
          
          const worker = new Worker(__filename, {
            workerData: { files: chunk }
          });
          
          workers.push(new Promise((resolve, reject) => {
            worker.on('message', resolve);
            worker.on('error', reject);
          }));
        }
        
        try {
          const workerResults = await Promise.all(workers);
          const allLinks = [];
          const xmlFiles = [];
          const directoryCount = {};
          const allContentTags = [];
          
          // Define file paths
          const finalFilePath = path.join(process.cwd(), 'src', 'final.txt');
          const dataFilePath = path.join(process.cwd(), 'src', 'data.txt');
          const hrefFilePath = path.join(process.cwd(), 'src', 'href.txt');
          
          workerResults.forEach(result => {
            allLinks.push(...result.links);
            xmlFiles.push(...result.files);
            allContentTags.push(...result.contentTags);
            
            // Merge directory counts
            Object.keys(result.directoryCount).forEach(dir => {
              if (!directoryCount[dir]) {
                directoryCount[dir] = 0;
              }
              directoryCount[dir] += result.directoryCount[dir];
            });
          });
          
          // Write all content tags to data.txt in src folder
          const numberedContent = allContentTags.map((content, index) => `${index + 1}. ${content}`).join('\n');
          fs.writeFileSync(dataFilePath, numberedContent);
          
          // Filter content tags that contain &lt;a...&gt; patterns and write to final.txt
          const filteredContent = allContentTags.filter(content => {
            const regex = /&lt;a[^&]*?&gt;/g;
            return regex.test(content);
          });
          const numberedFilteredContent = filteredContent.map((content, index) => `${index + 1}. ${content}`).join('\n');
          fs.writeFileSync(finalFilePath, numberedFilteredContent);
          
          // Filter content tags that contain &lt;link...&gt; patterns and write to href.txt
          const hrefContent = allContentTags.filter(content => {
            const regex = /&lt;link[^&]*?&gt;/g;
            return regex.test(content);
          });
          const numberedHrefContent = hrefContent.map((content, index) => `${index + 1}. ${content}`).join('\n');
          fs.writeFileSync(hrefFilePath, numberedHrefContent);
          
          res.status(200).json({
            success: true,
            message: "Zip file processed successfully",
            data: {
              extractedTo: outputDir,
              finalFile: finalFilePath,
              dataFile: dataFilePath,
              hrefFile: hrefFilePath,
              totalFolders: folderCount,
              totalXmlFiles: xmlFileCount,
              xmlFilesByDirectory: directoryCount,
              xmlFiles,
              totalLinks: allLinks.length,
              totalContentTags: allContentTags.length,
              filteredContentTags: filteredContent.length,
              hrefContentTags: hrefContent.length,
              links: allLinks
            }
          });
        } catch (error) {
          next(error);
        }
      });
    });
  } catch (error) {
    next(error);
  }
};

// Worker thread code
if (!isMainThread) {
  const { files } = workerData;
  const links = [];
  const processedFiles = [];
  const directoryCount = {};
  const allContentTags = [];
  
  files.forEach(filePath => {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Extract all content tags
    const contentPattern = /<content>(.*?)<\/content>/g;
    let match;
    
    while ((match = contentPattern.exec(content)) !== null) {
      allContentTags.push(match[1]);
    }
    
    // Extract links for existing functionality
    const linkPattern = /&amp;lt;link[^&]*?\/&amp;gt;/g;
    const aPattern = /&amp;lt;a[^&]*?&amp;gt;.*?&amp;lt;\/a&amp;gt;/g;
    
    const fileLinks = content.match(linkPattern) || [];
    const aTags = content.match(aPattern) || [];
    
    links.push(...fileLinks, ...aTags);
    
    // Count by directory structure
    const relativePath = path.relative(path.join(process.cwd(), 'output'), filePath);
    const dirPath = path.dirname(relativePath);
    
    if (!directoryCount[dirPath]) {
      directoryCount[dirPath] = 0;
    }
    directoryCount[dirPath]++;
    
    processedFiles.push({
      name: path.basename(filePath),
      path: filePath,
      directory: dirPath,
      size: fs.statSync(filePath).size,
      linksFound: fileLinks.length + aTags.length
    });
  });
  
  parentPort.postMessage({ links, files: processedFiles, directoryCount, contentTags: allContentTags });
}

const convertPdfsZipToZip = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No zip file uploaded"
      });
    }

    const tempDir = path.join(process.cwd(), 'temp', Date.now().toString());
    const outputDir = path.join(process.cwd(), 'pdfoutput');
    
    await fs.promises.mkdir(tempDir, { recursive: true });
    await fs.promises.mkdir(outputDir, { recursive: true });

    // Extract uploaded zip
    const zip = new AdmZip(req.file.path);
    zip.extractAllTo(tempDir, true);

    // Find all PDF files
    const pdfFiles = [];
    const findPdfs = (dir) => {
      const files = fs.readdirSync(dir);
      files.forEach(file => {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
          findPdfs(fullPath);
        } else if (file.toLowerCase().endsWith('.pdf')) {
          pdfFiles.push(fullPath);
        }
      });
    };
    findPdfs(tempDir);

    // Convert PDFs to PNGs
    for (const pdfPath of pdfFiles) {
      await convertPdfToPng(pdfPath, outputDir);
    }

    // Create output zip
    const outputZip = new AdmZip();
    const addToZip = (dir, zipPath = '') => {
      const files = fs.readdirSync(dir);
      files.forEach(file => {
        const fullPath = path.join(dir, file);
        const zipFilePath = path.join(zipPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
          addToZip(fullPath, zipFilePath);
        } else {
          outputZip.addLocalFile(fullPath, zipPath);
        }
      });
    };
    addToZip(outputDir);

    // Clean up temp files
    fs.unlinkSync(req.file.path);
    fs.rmSync(tempDir, { recursive: true, force: true });

    // Send zip file
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="converted-pdfs.zip"'
    });
    res.send(outputZip.toBuffer());

  } catch (error) {
    next(error);
  }
};

module.exports = {
  getUsers,
  uploadZip,
  convertPdfsZipToZip,
  upload
};
