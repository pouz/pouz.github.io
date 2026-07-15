import 'dart:io';

void main() async {
  final webDir = Directory('build/web');
  if (!await webDir.exists()) {
    print('Error: build/web directory not found. Please run "flutter build web" first.');
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 복사할 실제 서브페이지 경로 리스트 (주소창 직접 접근 및 크롤러 200 OK 지원)
  // ─────────────────────────────────────────────────────────────────────────
  final routes = [
    'company/info',
    'products/construction',
    'technology/multilevel',
    'technology/nanocoating',
    'technology/laserrouting',
    'videos',
    'adminlogin',
    'admindashboard',
    'board/notice',
    'board/data',
    'board/free',
    'board/stepcase',
  ];

  final indexFile = File('build/web/index.html');
  if (!await indexFile.exists()) {
    print('Error: build/web/index.html not found.');
    return;
  }

  print('Starting post-process: Copying index.html to subfolders for crawler 200 OK support...');

  for (final route in routes) {
    final dir = Directory('build/web/$route');
    if (!await dir.exists()) {
      await dir.create(recursive: true);
    }
    await indexFile.copy('${dir.path}/index.html');
    print('✓ Copied index.html -> build/web/$route/index.html');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CNAME 파일 자동 생성 (강제 푸시 시에도 깃허브 커스텀 도메인 연동이 절대 풀리지 않게 보존)
  // ─────────────────────────────────────────────────────────────────────────
  final cnameFile = File('build/web/CNAME');
  await cnameFile.writeAsString('uptech.co.kr');
  print('✓ Created CNAME -> uptech.co.kr');

  print('Post-process completed successfully! Now upload the entire "build/web" folder.');
}
