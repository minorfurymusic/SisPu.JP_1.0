from PySide6.QtWidgets import QMainWindow, QTabWidget, QLabel
from sispubint.ui.secretarias import SecretariasPage
from sispubint.ui.auditoria import AuditoriaPage


class MainWindow(QMainWindow):
    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle("SisPubInt - Administração / Despesas")

        tabs = QTabWidget()
        tabs.addTab(SecretariasPage(), "Secretarias")
        tabs.addTab(QLabel("Cadastro de unidades será implementado na próxima etapa."), "Unidades")
        tabs.addTab(QLabel("Cadastro de despesas será implementado na próxima etapa."), "Despesas")
        tabs.addTab(QLabel("Itens de despesas será implementado na próxima etapa."), "Itens de Despesas")
        tabs.addTab(QLabel("Lançamentos mensais será implementado na próxima etapa."), "Lançamentos")
        tabs.addTab(AuditoriaPage(), "Auditoria")
        self.setCentralWidget(tabs)
