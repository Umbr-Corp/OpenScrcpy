use flate2::read::GzDecoder;
use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tar::Archive;

static INSTALL_DIR: OnceLock<PathBuf> = OnceLock::new();

/// Asset tag and archive extension for the running platform. Linux arm64 has
/// no official scrcpy build, so it fails with a message instead of silently
/// downloading the x86_64 archive.
pub fn resolve_asset(os: &str, arch: &str) -> Result<(&'static str, &'static str), String> {
    match (os, arch) {
        ("linux", "x86_64") => Ok(("linux-x86_64", ".tar.gz")),
        ("linux", "aarch64") => Err(
            "No official scrcpy build for Linux arm64. Install scrcpy from your distribution package manager."
                .to_string(),
        ),
        ("windows", "x86_64") => Ok(("win64", ".zip")),
        ("windows", "aarch64") => Ok(("winarm64", ".zip")),
        ("windows", "x86") => Ok(("win32", ".zip")),
        ("macos", "x86_64") => Ok(("macos-x86_64", ".tar.gz")),
        ("macos", "aarch64") => Ok(("macos-aarch64", ".tar.gz")),
        _ => Err(format!(
            "Unsupported platform for auto-download: {} ({})",
            os, arch
        )),
    }
}

/// Find the checksum for `filename` in a SHA256SUMS.txt body. A matching line
/// with a malformed hash is an error, not a skip: the release file is the
/// only integrity signal we have.
pub fn parse_sha256sums(text: &str, filename: &str) -> Result<String, String> {
    for line in text.lines() {
        let mut parts = line.split_whitespace();
        let (Some(hash), Some(name)) = (parts.next(), parts.next()) else {
            continue;
        };
        if name.trim_start_matches('*') != filename {
            continue;
        }
        if hash.len() == 64 && hash.chars().all(|c| c.is_ascii_hexdigit()) {
            return Ok(hash.to_ascii_lowercase());
        }
        return Err(format!("Malformed SHA256 entry for {}", filename));
    }
    Err(format!("SHA256SUMS.txt has no entry for {}", filename))
}

pub fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = std::fs::File::open(path)
        .map_err(|e| format!("Failed to open archive for checksum: {}", e))?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let read = file.read(&mut buf).map_err(|e| e.to_string())?;
        if read == 0 {
            break;
        }
        hasher.update(&buf[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

pub fn exe_name(base: &str) -> String {
    let ext = std::env::consts::EXE_EXTENSION;
    if ext.is_empty() {
        base.to_string()
    } else {
        format!("{}.{}", base, ext)
    }
}

/// Resolved once in `setup`: the executable directory in portable mode when
/// it is writable, otherwise the per-user app data directory.
pub fn init_install_dir(app: &tauri::AppHandle) -> PathBuf {
    use tauri::Manager;

    let portable = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .filter(|dir| is_writable(dir))
        .map(|dir| dir.join("scrcpy-bin"));
    let chosen = portable
        .or_else(|| {
            app.path()
                .app_data_dir()
                .ok()
                .map(|dir| dir.join("scrcpy-bin"))
        })
        .unwrap_or_else(|| std::env::temp_dir().join("openscrcpy").join("scrcpy-bin"));
    let _ = INSTALL_DIR.set(chosen.clone());
    chosen
}

pub fn install_dir() -> Option<&'static Path> {
    INSTALL_DIR.get().map(PathBuf::as_path)
}

fn is_writable(dir: &Path) -> bool {
    if std::fs::create_dir_all(dir).is_err() {
        return false;
    }
    let probe = dir.join(format!(".write-test-{}", std::process::id()));
    match std::fs::write(&probe, b"") {
        Ok(()) => {
            let _ = std::fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

pub fn extract_archive(archive: &Path, dest: &Path, extension: &str) -> Result<(), String> {
    std::fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    if extension == ".zip" {
        let file =
            std::fs::File::open(archive).map_err(|e| format!("Failed to open zip: {}", e))?;
        let mut zip =
            zip::ZipArchive::new(file).map_err(|e| format!("Failed to read zip archive: {}", e))?;
        zip.extract(dest)
            .map_err(|e| format!("Failed to extract: {}", e))?;
    } else {
        let file =
            std::fs::File::open(archive).map_err(|e| format!("Failed to open tar.gz: {}", e))?;
        let tar = GzDecoder::new(file);
        let mut archive = Archive::new(tar);
        archive
            .unpack(dest)
            .map_err(|e| format!("Failed to extract tar: {}", e))?;
    }
    Ok(())
}

/// Release archives usually contain a single root folder; Windows zips put
/// the files at the top level. Both are flattened to the same target.
pub fn single_root(extract_dir: &Path) -> Result<PathBuf, String> {
    let mut entries = std::fs::read_dir(extract_dir).map_err(|e| e.to_string())?;
    let first = entries.next();
    let has_second = entries.next().is_some();
    match first {
        Some(entry) => {
            let path = entry.map_err(|e| e.to_string())?.path();
            if path.is_dir() && !has_second {
                Ok(path)
            } else {
                Ok(extract_dir.to_path_buf())
            }
        }
        None => Err("Downloaded archive was empty".to_string()),
    }
}

pub fn validate_extracted(dir: &Path, adb_expected: bool) -> Result<(), String> {
    if !dir.join(exe_name("scrcpy")).is_file() {
        return Err("Downloaded archive did not contain the expected scrcpy binary".to_string());
    }
    if adb_expected && !dir.join(exe_name("adb")).is_file() {
        return Err("Downloaded archive did not contain the expected adb binary".to_string());
    }
    Ok(())
}

pub fn copy_dir_all(src: impl AsRef<Path>, dst: impl AsRef<Path>) -> std::io::Result<()> {
    let src_ref = src.as_ref();
    let dst_ref = dst.as_ref();

    let canonical_dst = if dst_ref.exists() {
        dst_ref.canonicalize()?
    } else {
        std::fs::create_dir_all(dst_ref)?;
        dst_ref.canonicalize()?
    };

    for entry in std::fs::read_dir(src_ref)? {
        let entry = entry?;
        let entry_path = entry.path();
        let file_name = entry.file_name();

        // Prevent directory traversal elements in entry name
        let file_name_str = file_name.to_string_lossy();
        if file_name_str.contains("..")
            || file_name_str.contains('/')
            || file_name_str.contains('\\')
        {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "Directory entry contains directory traversal components",
            ));
        }

        let target_path = dst_ref.join(&file_name);

        // Ensure destination path is strictly within the target base directory
        if let Some(parent_dir) = target_path.parent() {
            if parent_dir.exists() {
                let canonical_parent = parent_dir.canonicalize()?;
                if !canonical_parent.starts_with(&canonical_dst)
                    && canonical_parent != canonical_dst
                {
                    return Err(std::io::Error::new(
                        std::io::ErrorKind::PermissionDenied,
                        "Path traversal attempt detected during directory copy",
                    ));
                }
            }
        }

        let ty = entry.file_type()?;
        if ty.is_dir() {
            copy_dir_all(&entry_path, &target_path)?;
        } else {
            std::fs::copy(&entry_path, &target_path)?;
        }
    }
    Ok(())
}

/// Removes every listed path unless disarmed. Used so a failed download or
/// extraction cannot leave `scrcpy-bin.new`, a partial archive or the extract
/// directory behind.
pub struct TempCleanup {
    paths: Vec<PathBuf>,
    armed: bool,
}

impl TempCleanup {
    pub fn new(paths: Vec<PathBuf>) -> Self {
        for path in &paths {
            remove_path(path);
        }
        Self { paths, armed: true }
    }

    pub fn disarm(&mut self) {
        self.armed = false;
    }
}

impl Drop for TempCleanup {
    fn drop(&mut self) {
        if !self.armed {
            return;
        }
        for path in &self.paths {
            remove_path(path);
        }
    }
}

fn remove_path(path: &Path) {
    if path.is_dir() {
        let _ = std::fs::remove_dir_all(path);
    } else if path.exists() {
        let _ = std::fs::remove_file(path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_asset_maps_every_supported_platform() {
        assert_eq!(
            resolve_asset("linux", "x86_64").unwrap(),
            ("linux-x86_64", ".tar.gz")
        );
        assert_eq!(
            resolve_asset("windows", "x86_64").unwrap(),
            ("win64", ".zip")
        );
        assert_eq!(
            resolve_asset("windows", "aarch64").unwrap(),
            ("winarm64", ".zip")
        );
        assert_eq!(resolve_asset("windows", "x86").unwrap(), ("win32", ".zip"));
        assert_eq!(
            resolve_asset("macos", "x86_64").unwrap(),
            ("macos-x86_64", ".tar.gz")
        );
        assert_eq!(
            resolve_asset("macos", "aarch64").unwrap(),
            ("macos-aarch64", ".tar.gz")
        );
        assert!(resolve_asset("linux", "aarch64").is_err());
        assert!(resolve_asset("freebsd", "x86_64").is_err());
    }

    #[test]
    fn parse_sha256sums_finds_the_asset_line() {
        let sums = "\
aaaabbbbccccddddeeeeffff0000111122223333444455556666777788889999  scrcpy-linux-x86_64-v3.3.3.tar.gz
0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef *scrcpy-win64-v3.3.3.zip
";
        assert_eq!(
            parse_sha256sums(sums, "scrcpy-win64-v3.3.3.zip").unwrap(),
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
        );
        assert!(parse_sha256sums(sums, "scrcpy-win64-v9.9.9.zip").is_err());
    }

    #[test]
    fn parse_sha256sums_rejects_a_malformed_hash() {
        let sums = "not-a-hash  scrcpy-win64-v3.3.3.zip\n";
        assert!(parse_sha256sums(sums, "scrcpy-win64-v3.3.3.zip").is_err());
    }
}
