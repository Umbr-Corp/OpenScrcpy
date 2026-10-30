use std::process::{Output, Stdio};
use std::time::Duration;
use tokio::process::Command;

/// Runs `cmd` to completion. If it exceeds `limit`, the child is killed and a
/// timeout error is returned. `kill_on_drop` is what turns the cancelled wait
/// into a real SIGKILL instead of an orphan process.
pub async fn output_with_timeout(mut cmd: Command, limit: Duration) -> Result<Output, String> {
    cmd.kill_on_drop(true)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let child = cmd
        .spawn()
        .map_err(|e| format!("failed to start process: {e}"))?;

    match tokio::time::timeout(limit, child.wait_with_output()).await {
        Ok(Ok(output)) => Ok(output),
        Ok(Err(e)) => Err(e.to_string()),
        Err(_) => Err(format!("command timed out after {}s", limit.as_secs())),
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::process::Stdio;
    use std::time::Duration;

    async fn pid_is_alive(pid: u32) -> bool {
        std::process::Command::new("kill")
            .args(["-0", &pid.to_string()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }

    #[tokio::test]
    async fn timeout_kills_the_child() {
        let pid_file =
            std::env::temp_dir().join(format!("openscrcpy-timeout-{}", std::process::id()));
        let script = format!("echo $$ > {}; sleep 30", pid_file.display());
        let mut cmd = Command::new("sh");
        cmd.args(["-c", &script]);

        // Long enough for `sh` to write the pid even on a loaded runner: at
        // 100ms the kill could win the race and the file never appeared.
        let err = output_with_timeout(cmd, Duration::from_secs(1))
            .await
            .expect_err("the command should time out");
        assert!(err.contains("timed out"));

        let pid: u32 = std::fs::read_to_string(&pid_file)
            .expect("pid file")
            .trim()
            .parse()
            .expect("pid");
        let _ = std::fs::remove_file(&pid_file);

        // Drop triggers start_kill; give the kernel a moment to reap it.
        for _ in 0..20 {
            if !pid_is_alive(pid).await {
                return;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        panic!("child {pid} survived the timeout");
    }

    #[tokio::test]
    async fn returns_output_when_command_finishes_in_time() {
        let mut cmd = Command::new("sh");
        cmd.args(["-c", "echo ok"]);
        let out = output_with_timeout(cmd, Duration::from_secs(2))
            .await
            .expect("command should finish");
        assert!(out.status.success());
        assert_eq!(String::from_utf8_lossy(&out.stdout).trim(), "ok");
    }
}
