!macro customInstall
  DetailPrint "Instalando Plugin VST3 do BenSF2 Workstation..."
  SetOutPath "$COMMONFILES64\VST3\BenSF2.vst3\Contents\x86_64-win"
  IfFileExists "$INSTDIR\resources\vst3\BenSF2.vst3" 0 +2
    CopyFiles /SILENT "$INSTDIR\resources\vst3\BenSF2.vst3" "$COMMONFILES64\VST3\BenSF2.vst3\Contents\x86_64-win\BenSF2.vst3"
!macroend

!macro customUnInstall
  DetailPrint "Removendo Plugin VST3 do BenSF2 Workstation..."
  RMDir /r "$COMMONFILES64\VST3\BenSF2.vst3"
!macroend
