//! 真机验证测试：枚举显示器 + DXGI/GDI 实际抓屏。
//! 运行：cargo test -p zmeng-capture -- --nocapture

#[cfg(target_os = "windows")]
#[test]
fn test_enumerate_and_capture() {
    let monitors = zmeng_capture::list_monitors().expect("枚举显示器失败");
    assert!(!monitors.is_empty(), "至少应有一台显示器");
    println!("==== zmeng-capture 显示器枚举 ====");
    for m in &monitors {
        println!(
            "  {} => ({}, {}) ~ ({}, {})  [{}x{}]",
            m.device_name,
            m.min_x,
            m.min_y,
            m.max_x,
            m.max_y,
            m.max_x - m.min_x,
            m.max_y - m.min_y,
        );
    }

    // 主屏必须包含 (0,0)
    let primary = monitors
        .iter()
        .find(|m| m.min_x <= 0 && m.max_x > 0 && m.min_y <= 0 && m.max_y > 0)
        .expect("未找到主屏");
    let origin_x = primary.min_x;
    let origin_y = primary.min_y;

    println!("==== 逐屏抓帧自测 ====");
    let rt = tokio_inline::<Vec<zmeng_capture::ZmengSelfTestResult>>();
    let results = rt(Box::pin(zmeng_capture::self_test()));
    assert!(!results.is_empty(), "自测应返回结果");
    let mut all_ok = true;
    for r in &results {
        println!(
            "  {} rect={:?} 方式={:?} 耗时={}ms 尺寸={:?} ok={} err={:?}",
            r.device_name, r.rect, r.method, r.elapsed_ms, r.image_size, r.ok, r.error
        );
        all_ok = all_ok && r.ok;
    }
    assert!(all_ok, "存在抓帧失败的显示器（DXGI+GDI 均失败）");

    // 直接抓主屏并校验尺寸与内容
    let (image, method) = tokio_inline::<Result<
        (image::RgbaImage, zmeng_capture::ZmengCaptureMethod),
        String,
    >>()(Box::pin(zmeng_capture::capture_monitor_by_rect(origin_x, origin_y)))
    .expect("抓取主屏失败");
    println!(
        "==== capture_monitor_by_rect: 方式={:?} 尺寸={}x{} ====",
        method,
        image.width(),
        image.height()
    );
    assert_eq!(
        (image.width(), image.height()),
        (
            (primary.max_x - primary.min_x) as u32,
            (primary.max_y - primary.min_y) as u32,
        ),
        "抓取尺寸应与显示器物理尺寸一致"
    );

    // 保存样张到临时目录便于人工核对
    let out = std::env::temp_dir().join("zmeng-capture-test.png");
    image.save(&out).expect("保存测试图失败");
    println!("样张已保存: {}", out.display());
}

/// self_test/capture 是 async fn（与未来接入主流程的形态一致），测试里用简易阻塞执行器驱动。
/// 避免引入 tokio dev-dependency。
#[cfg(target_os = "windows")]
fn tokio_inline<T>() -> impl FnOnce(std::pin::Pin<Box<dyn std::future::Future<Output = T>>>) -> T {
    // 本模块的 async fn 内部并无 await 点（纯同步实现），直接 block_on 语义即可：
    // 用一个最小的轮询循环驱动。
    fn block_on<F: std::future::Future>(fut: F) -> F::Output {
        let waker = std::task::Waker::noop();
        let mut cx = std::task::Context::from_waker(waker);
        let mut fut = std::pin::pin!(fut);
        loop {
            match fut.as_mut().poll(&mut cx) {
                std::task::Poll::Ready(v) => return v,
                std::task::Poll::Pending => std::thread::yield_now(),
            }
        }
    }
    |fut| block_on(fut)
}
