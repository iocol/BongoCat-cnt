use std::process::{Command, Stdio};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use tauri::command;

const TASK_NAME: &str = "BongoCatAutoStart";
const OLD_REG_KEY: &str = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";

fn get_exe_path() -> String {
    std::env::current_exe()
        .ok()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default()
}

#[cfg(target_os = "windows")]
fn clean_old_registry() {
    let _ = Command::new("reg")
        .args(["delete", OLD_REG_KEY, "/v", "BongoCat", "/f"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(0x08000000)
        .output();
}

#[command]
pub fn is_autostart_enabled() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("schtasks")
            .args(["/query", "/tn", TASK_NAME, "/fo", "csv", "/nh"])
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .creation_flags(0x08000000)
            .output()
            .map_err(|e| e.to_string())?;

        Ok(output.status.success() && !output.stdout.is_empty())
    }

    #[cfg(not(target_os = "windows"))]
    Ok(false)
}

#[command]
pub fn enable_autostart() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let exe_path = get_exe_path();

        // Clean up old registry-based autostart from tauri-plugin-autostart
        clean_old_registry();

        let output = Command::new("schtasks")
            .args([
                "/create",
                "/tn",
                TASK_NAME,
                "/tr",
                &format!("\"{}\" --auto-launch", exe_path),
                "/sc",
                "onlogon",
                "/rl",
                "highest",
                "/f",
            ])
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .creation_flags(0x08000000)
            .output()
            .map_err(|e| e.to_string())?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Failed to create scheduled task: {}", stderr));
        }

        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    Ok(())
}

#[command]
pub fn disable_autostart() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("schtasks")
            .args(["/delete", "/tn", TASK_NAME, "/f"])
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .creation_flags(0x08000000)
            .output()
            .map_err(|e| e.to_string())?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            // "task not found" is not an error
            if !stderr.contains("not found") {
                return Err(format!("Failed to delete scheduled task: {}", stderr));
            }
        }

        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    Ok(())
}
