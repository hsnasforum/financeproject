param(
  [Parameter(Mandatory = $true)]
  [int]$ListenPort,
  [Parameter(Mandatory = $true)]
  [string]$TargetHost,
  [Parameter(Mandatory = $true)]
  [int]$TargetPort,
  [string]$ListenAddressesCsv = "127.0.0.1",
  [switch]$ExitAfterStartup
)

$bridgeSource = @"
using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Sockets;
using System.Threading;
using System.Threading.Tasks;

public sealed class TcpForwardBridge : IDisposable
{
    private readonly TcpListener _listener;
    private readonly string _targetHost;
    private readonly int _targetPort;
    private readonly CancellationTokenSource _cts = new CancellationTokenSource();

    public TcpForwardBridge(string listenAddress, int listenPort, string targetHost, int targetPort)
    {
        _targetHost = targetHost;
        _targetPort = targetPort;
        _listener = new TcpListener(IPAddress.Parse(listenAddress), listenPort);
    }

    public void Start()
    {
        _listener.Start();
        Task acceptTask = AcceptLoopAsync();
    }

    private async Task AcceptLoopAsync()
    {
        while (!_cts.IsCancellationRequested)
        {
            TcpClient client = null;
            try
            {
                client = await _listener.AcceptTcpClientAsync().ConfigureAwait(false);
                Task handleTask = HandleClientAsync(client);
            }
            catch (ObjectDisposedException)
            {
                if (client != null)
                {
                    client.Dispose();
                }
                break;
            }
            catch (SocketException)
            {
                if (client != null)
                {
                    client.Dispose();
                }
                if (_cts.IsCancellationRequested)
                {
                    break;
                }
            }
            catch
            {
                if (client != null)
                {
                    client.Dispose();
                }
                if (_cts.IsCancellationRequested)
                {
                    break;
                }
            }
        }
    }

    private async Task HandleClientAsync(TcpClient client)
    {
        using (client)
        using (var upstream = new TcpClient())
        {
            try
            {
                await upstream.ConnectAsync(_targetHost, _targetPort).ConfigureAwait(false);
                using (var downstreamStream = client.GetStream())
                using (var upstreamStream = upstream.GetStream())
                {
                    var copyDownstream = downstreamStream.CopyToAsync(upstreamStream);
                    var copyUpstream = upstreamStream.CopyToAsync(downstreamStream);
                    await Task.WhenAny(copyDownstream, copyUpstream).ConfigureAwait(false);
                }
            }
            catch
            {
                try
                {
                    client.Close();
                }
                catch
                {
                }
            }
        }
    }

    public void Dispose()
    {
        try
        {
            _cts.Cancel();
        }
        catch
        {
        }

        try
        {
            _listener.Stop();
        }
        catch
        {
        }

        _cts.Dispose();
    }
}
"@

Add-Type -TypeDefinition $bridgeSource -Language CSharp

function Format-BridgeListener {
  param(
    [string]$ListenAddress,
    [int]$Port
  )

  if ($ListenAddress.Contains(":") -and -not $ListenAddress.StartsWith("[")) {
    return ("[{0}]:{1}" -f $ListenAddress, $Port)
  }

  return ("{0}:{1}" -f $ListenAddress, $Port)
}

$bridges = New-Object System.Collections.Generic.List[Object]
$startedCount = 0
$listenAddresses = @()
$startedListeners = @()
$bindFailureListeners = @()

foreach ($value in ($ListenAddressesCsv -split ",")) {
  $trimmed = $value.Trim()
  if ($trimmed.Length -gt 0) {
    $listenAddresses += $trimmed
  }
}

if ($listenAddresses.Count -eq 0) {
  $listenAddresses = @("127.0.0.1")
}

try {
  foreach ($listenAddress in $listenAddresses) {
    $formattedListenAddress = Format-BridgeListener -ListenAddress $listenAddress -Port $ListenPort
    try {
      $bridge = [TcpForwardBridge]::new($listenAddress, $ListenPort, $TargetHost, $TargetPort)
      $bridge.Start()
      $bridges.Add($bridge)
      $startedCount += 1
      $startedListeners += $formattedListenAddress
    } catch {
      $bindFailureListeners += $formattedListenAddress
    }
  }

  $startedSummary = if ($startedListeners.Count -gt 0) { $startedListeners -join "," } else { "-" }
  $warningSummary = if ($bindFailureListeners.Count -gt 0) { $bindFailureListeners -join "," } else { "-" }

  if ($startedCount -eq 0) {
    Write-Output ("STATUS FAIL started={0} warnings={1}" -f $startedSummary, $warningSummary)
    exit 1
  }

  Write-Output ("STATUS READY started={0} warnings={1}" -f $startedSummary, $warningSummary)

  if ($ExitAfterStartup) {
    return
  }

  while ($true) {
    Start-Sleep -Seconds 3600
  }
} finally {
  foreach ($bridge in $bridges) {
    try {
      $bridge.Dispose()
    } catch {
    }
  }
}
