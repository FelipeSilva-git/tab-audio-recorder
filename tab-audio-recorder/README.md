# Gravador de Áudio de Aba (Chrome/Edge/Brave)

## Como instalar (modo desenvolvedor)

1. Extraia esta pasta em algum lugar do seu PC.
2. Abra `chrome://extensions` no navegador.
3. Ative o **"Modo desenvolvedor"** (canto superior direito).
4. Clique em **"Carregar sem compactação"** e selecione a pasta extraída.
5. O ícone da extensão vai aparecer na barra de ferramentas.

## Como usar

1. Abra a aba cujo áudio você quer gravar (ex: um site tocando música ou vídeo).
2. Clique no ícone da extensão.
3. Clique em **"Iniciar Gravação"**.
4. Quando terminar, clique em **"Parar e Baixar"** — o navegador baixa
   automaticamente um arquivo `.webm` com o áudio.

- **Limite de tempo configurável**: por padrão a gravação para sozinha e
  baixa o arquivo automaticamente depois de **1 hora**. Dá pra trocar pra
  15min / 30min / 1h / 2h / 3h / 4h / sem limite, direto no popup, antes
  de clicar em "Iniciar Gravação" (a opção escolhida fica salva e é
  lembrada da próxima vez). Implementado com `chrome.alarms`, que —
  assim como o `storage.session` — sobrevive ao service worker sendo
  descarregado, então o limite funciona mesmo que você não abra o popup
  de novo até a hora de parar. Ao parar automaticamente, aparece uma
  notificação do sistema avisando que o áudio foi salvo.

## Observações técnicas

- Usa Manifest V3 + `chrome.tabCapture` + um **offscreen document**, que é
  a forma correta de acessar `getUserMedia`/`MediaRecorder` hoje em dia,
  já que o service worker (`background.js`) sozinho não tem acesso a
  APIs de mídia.
- O áudio da aba é redirecionado de volta pros alto-falantes via
  `AudioContext`, senão o usuário ficaria sem ouvir nada durante a gravação
  (comportamento padrão do `tabCapture`).
- O estado de "gravando" fica salvo em `chrome.storage.session`, não em
  variável comum — isso porque o `background.js` (service worker) é
  descarregado pelo Chrome após ~30s de inatividade, e uma variável normal
  perderia o valor nesse processo. Reabrir o popup sempre reflete o estado
  real (checando inclusive se o offscreen document ainda existe).
- **Salvamento incremental**: em vez de acumular tudo na RAM até o fim,
  o áudio é gravado em pedaços de 60s e cada pedaço já é salvo no
  `IndexedDB` (disco) assim que fica pronto. Isso limita a perda em caso
  de o navegador travar/fechar durante uma gravação longa — no pior caso
  você perde só o último minuto, não a gravação inteira. No final, os
  pedaços são remontados num único arquivo `.webm` e o IndexedDB é limpo.
- O arquivo final sai em `.webm` (codec Opus). Se quiser `.mp3`, dá pra
  converter depois com ffmpeg, ou trocar o `MediaRecorder` pra gravar em
  outro formato suportado pelo navegador.
- A gravação só funciona enquanto o popup permanece "vivo" via mensagens
  — o `offscreen.js` é quem efetivamente segura o `MediaRecorder`, então
  fechar o popup NÃO interrompe a gravação.

## Limites práticos de duração

Não há limite artificial no código. Com salvamento incremental, o consumo
de RAM fica baixo mesmo em gravações longas (o áudio vai pro disco a cada
minuto, não fica tudo acumulado). Estimativa de tamanho final (Opus):

- ~1h ≈ 50–70MB
- ~2h ≈ 100–140MB
- ~4h+ ≈ tranquilo pra qualquer PC moderno

O que ainda pode interromper uma gravação longa:
- A aba sendo gravada navegar/recarregar pra outra URL (mata a captura).
- Fechar o Chrome por completo (o offscreen document some).
- PC entrar em suspensão/hibernação no meio da gravação.

Em qualquer um desses casos, o que já foi salvo no IndexedDB até aquele
ponto não é baixado automaticamente sozinho — fica no disco esperando,
mas seria preciso adicionar uma tela de "recuperar gravação anterior" pra
resgatar isso depois. Avise se quiser essa função também.

## Próximos passos possíveis

- Adicionar um indicador visual (badge no ícone) mostrando que está gravando.
- Permitir escolher outra aba além da ativa (precisa listar `chrome.tabs.query({})`).
- Exportar direto em `.mp3` usando uma lib tipo `lamejs` dentro do offscreen.
- Tela de recuperação de gravações interrompidas (dados já ficam salvos no
  IndexedDB, só falta a UI pra resgatar).
