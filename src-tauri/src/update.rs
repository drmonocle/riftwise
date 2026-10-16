//! Pure helpers for the self-updater. Kept OS-independent so they can be unit tested anywhere.

use sha2::{Digest, Sha256};

const RELEASE_DOWNLOAD_PREFIX: &str = "https://github.com/drmonocle/riftwise/releases/download/";

/// Largest update binary we are willing to download (bytes).
pub const MAX_UPDATE_BYTES: u64 = 100 * 1024 * 1024;

fn is_safe_segment(s: &str, allow_plus: bool) -> bool {
    !s.is_empty()
        && s != "."
        && s != ".."
        && s.len() <= 128
        && s.chars().all(|c| {
            c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_') || (allow_plus && c == '+')
        })
}

/// True only for `https://github.com/drmonocle/riftwise/releases/download/<tag>/<file>`.
/// Rejects dot-segments, query strings, fragments, percent-escapes and extra path parts.
pub fn is_official_release_asset(url: &str) -> bool {
    let Some(rest) = url.strip_prefix(RELEASE_DOWNLOAD_PREFIX) else {
        return false;
    };
    let mut parts = rest.split('/');
    let (Some(tag), Some(file), None) = (parts.next(), parts.next(), parts.next()) else {
        return false;
    };
    is_safe_segment(tag, true) && is_safe_segment(file, false)
}

/// Extracts the hash from a `sha256sum`/`certutil`-style checksum file (first token).
pub fn parse_sha256(text: &str) -> Option<String> {
    let token = text.split_whitespace().next()?;
    if token.len() == 64 && token.chars().all(|c| c.is_ascii_hexdigit()) {
        Some(token.to_ascii_lowercase())
    } else {
        None
    }
}

/// Where the running exe is moved during an update: `RiftWise.exe` -> `RiftWise.exe.old`.
pub fn old_exe_path(exe: &std::path::Path) -> std::path::PathBuf {
    let mut name = exe.file_name().map(|n| n.to_os_string()).unwrap_or_default();
    name.push(".old");
    exe.with_file_name(name)
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|b| format!("{:02x}", b)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_official_assets() {
        assert!(is_official_release_asset(
            "https://github.com/drmonocle/riftwise/releases/download/v0.3.7/RiftWise.exe"
        ));
        assert!(is_official_release_asset(
            "https://github.com/drmonocle/riftwise/releases/download/v0.3.7/RiftWise.exe.sha256"
        ));
    }

    #[test]
    fn rejects_everything_else() {
        let bad = [
            "http://github.com/drmonocle/riftwise/releases/download/v1/RiftWise.exe",
            "https://github.com/drmonocle/riftwise/releases/",
            "https://github.com/drmonocle/riftwise/releases/latest/download/RiftWise.exe",
            "https://github.com/drmonocle/riftwise/releases/download/../../evil/x.exe",
            "https://github.com/drmonocle/riftwise/releases/download/v1/../x.exe",
            "https://github.com/drmonocle/riftwise/releases/download/v1/%2e%2e/x.exe",
            "https://github.com/drmonocle/riftwise/releases/download/v1/a.exe?x=1",
            "https://github.com/drmonocle/riftwise/releases/download/v1/a.exe#frag",
            "https://github.com/drmonocle/riftwise/releases/download/v1/a/b.exe",
            "https://github.com/drmonocle/riftwise/releases/download/v1/",
            "https://github.com/drmonocle/riftwise-evil/releases/download/v1/a.exe",
            "https://github.com.evil.com/drmonocle/riftwise/releases/download/v1/a.exe",
            "",
        ];
        for u in bad {
            assert!(!is_official_release_asset(u), "should reject {u}");
        }
    }

    #[test]
    fn parses_checksum_files() {
        let h = "a".repeat(64);
        assert_eq!(parse_sha256(&format!("{h}  RiftWise.exe\n")), Some(h.clone()));
        assert_eq!(parse_sha256(&h.to_uppercase()), Some(h));
        assert_eq!(parse_sha256("not a hash"), None);
        assert_eq!(parse_sha256(&"g".repeat(64)), None);
        assert_eq!(parse_sha256(""), None);
    }

    #[test]
    fn old_exe_sits_beside_the_exe() {
        let p = std::path::Path::new("C:/Apps/RiftWise/RiftWise.exe");
        assert_eq!(old_exe_path(p), std::path::Path::new("C:/Apps/RiftWise/RiftWise.exe.old"));
    }

    #[test]
    fn hashes_known_vector() {
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }
}
