@echo off
rem Uma passada do conferidor. O Agendador de Tarefas chama este arquivo a cada 10 minutos.
cd /d "%~dp0"
node conferidor.mjs --uma-vez >> conferidor.log 2>&1
