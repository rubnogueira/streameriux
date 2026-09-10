/** Native "open file" dialog for a channel catalog: a TOML or an M3U/M3U8 playlist. */
export async function pickCatalogFile(): Promise<string | null> {
  if (process.platform === 'darwin') {
    const proc = Bun.spawn(
      [
        'osascript',
        '-e',
        'try\nPOSIX path of (choose file of type {"public.toml", "toml", "m3u", "m3u8", "public.data", "public.text"} with prompt "Add a playlist or catalog file")\non error number -128\nreturn ""\nend try',
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    )
    const text = (await new Response(proc.stdout).text()).trim()
    await proc.exited
    return text || null
  }

  if (process.platform === 'linux') {
    const proc = Bun.spawn(
      [
        'zenity',
        '--file-selection',
        '--file-filter=Playlists & catalogs | *.toml *.m3u *.m3u8',
        '--title=Add a playlist or catalog file',
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    )
    const text = (await new Response(proc.stdout).text()).trim()
    const code = await proc.exited
    if (code !== 0) return null
    return text || null
  }

  const script =
    'Add-Type -AssemblyName System.Windows.Forms; ' +
    '$d = New-Object System.Windows.Forms.OpenFileDialog; ' +
    '$d.Filter = "Playlists & catalogs (*.m3u8;*.m3u;*.toml)|*.m3u8;*.m3u;*.toml|All files (*.*)|*.*"; ' +
    'if ($d.ShowDialog() -eq "OK") { $d.FileName }'
  const proc = Bun.spawn(['powershell', '-NoProfile', '-Command', script], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const text = (await new Response(proc.stdout).text()).trim()
  await proc.exited
  return text || null
}

/** Native "choose folder" dialog for the base folder holding catalogs/playlists. */
export async function pickCatalogFolder(): Promise<string | null> {
  if (process.platform === 'darwin') {
    const proc = Bun.spawn(
      [
        'osascript',
        '-e',
        'try\nPOSIX path of (choose folder with prompt "Choose the folder for your playlists and channels")\non error number -128\nreturn ""\nend try',
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    )
    const text = (await new Response(proc.stdout).text()).trim()
    await proc.exited
    return text || null
  }

  if (process.platform === 'linux') {
    const proc = Bun.spawn(
      ['zenity', '--file-selection', '--directory', '--title=Choose the folder for your playlists and channels'],
      { stdout: 'pipe', stderr: 'pipe' },
    )
    const text = (await new Response(proc.stdout).text()).trim()
    const code = await proc.exited
    if (code !== 0) return null
    return text || null
  }

  const script =
    'Add-Type -AssemblyName System.Windows.Forms; ' +
    '$d = New-Object System.Windows.Forms.FolderBrowserDialog; ' +
    '$d.Description = "Choose the folder for your playlists and channels"; ' +
    'if ($d.ShowDialog() -eq "OK") { $d.SelectedPath }'
  const proc = Bun.spawn(['powershell', '-NoProfile', '-Command', script], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const text = (await new Response(proc.stdout).text()).trim()
  await proc.exited
  return text || null
}
