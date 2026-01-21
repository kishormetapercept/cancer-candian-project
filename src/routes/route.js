const express = require("express");
const { getUsers, uploadZip, convertPdfsZipToZip, upload } = require("../controllers/controller");
const router = express.Router();

router.get("/", getUsers);
router.post("/upload-zip", upload.single("file"), uploadZip);
router.post("/convert-pdfs-zip", upload.single("file"), convertPdfsZipToZip);
router.post("/convert-pdfs", upload.single("file"), convertPdfsZipToZip);

module.exports = router;
