const express = require("express");
const { getUsers, uploadZip, upload } = require("../controllers/controller");
const router = express.Router();

router.get("/", getUsers);
router.post("/upload-zip", upload.single("file"), uploadZip);

module.exports = router;
